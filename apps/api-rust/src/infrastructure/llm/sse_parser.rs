//! Splits a streamed response body into complete server-sent-event frames.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseFrame {
    /// The `event:` line, if present. Anthropic sets this; OpenAI never does.
    pub event: Option<String>,
    /// The `data:` line(s), joined by `\n` per the SSE spec (rare for these
    /// APIs, which send one `data:` line per frame).
    pub data: String,
}

/// A network read has no relationship to SSE event boundaries: one read can
/// hold a partial line, several whole events, or an event split mid-line
/// across two reads. This buffers what has arrived and hands back only the
/// frames that are complete (terminated by a blank line), holding any
/// trailing partial frame for the next read. A partial frame still buffered
/// when the body ends is dropped.
///
/// The buffer is bytes rather than text, so a multi-byte character split
/// across two reads is reassembled before it is decoded.
#[derive(Debug, Default)]
pub struct SseParser {
    buffer: Vec<u8>,
}

impl SseParser {
    pub fn push(&mut self, chunk: &[u8]) -> Vec<SseFrame> {
        self.buffer.extend_from_slice(chunk);
        // Safe to repeat over the whole buffer: earlier bytes have no `\r\n`
        // left, so this only touches the new tail, and a `\r` that arrived
        // without its `\n` is picked up on the next push.
        self.buffer = normalize_crlf(&self.buffer);

        let mut frames = Vec::new();
        while let Some(separator) = find(&self.buffer, b"\n\n") {
            let raw: Vec<u8> = self.buffer.drain(..separator + 2).collect();
            let text = String::from_utf8_lossy(&raw[..separator]);
            if let Some(frame) = parse_frame(&text) {
                frames.push(frame);
            }
        }
        frames
    }
}

fn normalize_crlf(bytes: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'\r' && bytes.get(index + 1) == Some(&b'\n') {
            index += 1;
        }
        out.push(bytes[index]);
        index += 1;
    }
    out
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|window| window == needle)
}

fn parse_frame(raw: &str) -> Option<SseFrame> {
    let mut event = None;
    let mut data_lines = Vec::new();

    for line in raw.split('\n') {
        if let Some(rest) = line.strip_prefix("event:") {
            event = Some(rest.trim().to_string());
        } else if let Some(rest) = line.strip_prefix("data:") {
            data_lines.push(rest.trim());
        }
    }

    if data_lines.is_empty() {
        return None;
    }
    Some(SseFrame { event, data: data_lines.join("\n") })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn collect(chunks: &[&[u8]]) -> Vec<SseFrame> {
        let mut parser = SseParser::default();
        chunks.iter().flat_map(|chunk| parser.push(chunk)).collect()
    }

    fn data(frames: &[SseFrame]) -> Vec<&str> {
        frames.iter().map(|frame| frame.data.as_str()).collect()
    }

    fn frame(event: Option<&str>, data: &str) -> SseFrame {
        SseFrame { event: event.map(str::to_string), data: data.to_string() }
    }

    #[test]
    fn parses_a_frame_with_both_an_event_and_a_data_line() {
        let frames = collect(&[b"event: message_start\ndata: {\"type\":\"a\"}\n\n"]);
        assert_eq!(frames, vec![frame(Some("message_start"), "{\"type\":\"a\"}")]);
    }

    #[test]
    fn parses_a_data_only_frame_with_no_event_line() {
        let frames = collect(&[b"data: {\"choices\":[]}\n\n"]);
        assert_eq!(frames, vec![frame(None, "{\"choices\":[]}")]);
    }

    #[test]
    fn parses_multiple_frames_delivered_in_a_single_chunk() {
        let frames = collect(&[b"data: one\n\ndata: two\n\ndata: three\n\n"]);
        assert_eq!(data(&frames), vec!["one", "two", "three"]);
    }

    #[test]
    fn reassembles_a_frame_split_mid_line_across_two_reads() {
        let frames = collect(&[b"data: {\"tex", b"t\":\"hi\"}\n\n"]);
        assert_eq!(frames, vec![frame(None, "{\"text\":\"hi\"}")]);
    }

    #[test]
    fn reassembles_a_frame_whose_blank_line_separator_is_split_across_two_reads() {
        let frames = collect(&[b"data: hello\n", b"\ndata: world\n\n"]);
        assert_eq!(data(&frames), vec!["hello", "world"]);
    }

    #[test]
    fn yields_nothing_until_the_frame_is_complete() {
        let mut parser = SseParser::default();
        assert!(parser.push(b"data: hel").is_empty());
        assert!(parser.push(b"lo\n").is_empty());
        assert_eq!(parser.push(b"\n"), vec![frame(None, "hello")]);
    }

    #[test]
    fn normalizes_crlf_line_endings() {
        let frames = collect(&[b"event: ping\r\ndata: {}\r\n\r\n"]);
        assert_eq!(frames, vec![frame(Some("ping"), "{}")]);
    }

    #[test]
    fn normalizes_a_crlf_split_between_two_reads() {
        let frames = collect(&[b"data: one\r", b"\n\r", b"\ndata: two\r\n\r\n"]);
        assert_eq!(data(&frames), vec!["one", "two"]);
    }

    #[test]
    fn reassembles_a_multi_byte_character_split_across_two_reads() {
        let bytes = "data: caf\u{e9} \u{1f600}\n\n".as_bytes();
        let (head, tail) = bytes.split_at(10);
        let frames = collect(&[head, tail]);
        assert_eq!(data(&frames), vec!["caf\u{e9} \u{1f600}"]);
    }

    #[test]
    fn drops_a_trailing_partial_frame_that_never_receives_its_blank_line() {
        let frames = collect(&[b"data: complete\n\ndata: incomplete"]);
        assert_eq!(data(&frames), vec!["complete"]);
    }

    #[test]
    fn skips_a_frame_with_no_data_line_at_all() {
        let frames = collect(&[b"event: ping\n\ndata: real\n\n"]);
        assert_eq!(frames, vec![frame(None, "real")]);
    }

    #[test]
    fn joins_several_data_lines_with_a_newline() {
        let frames = collect(&[b"data: one\ndata: two\n\n"]);
        assert_eq!(data(&frames), vec!["one\ntwo"]);
    }
}
