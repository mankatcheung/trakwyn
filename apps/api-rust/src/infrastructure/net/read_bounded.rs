use async_trait::async_trait;

/// A response body that arrives a chunk at a time.
#[async_trait]
pub trait ChunkedBody: Send {
    type Chunk: AsRef<[u8]> + Send;
    type Error: Send;

    /// The next chunk, or `None` once the body is complete.
    async fn next_chunk(&mut self) -> Result<Option<Self::Chunk>, Self::Error>;
}

#[async_trait]
impl ChunkedBody for reqwest::Response {
    type Chunk = Vec<u8>;
    type Error = reqwest::Error;

    async fn next_chunk(&mut self) -> Result<Option<Vec<u8>>, reqwest::Error> {
        Ok(self.chunk().await?.map(|chunk| chunk.to_vec()))
    }
}

const UTF8_BOM: &[u8] = b"\xEF\xBB\xBF";

/// Reads at most `max_bytes` of a response body and stops, unlike
/// `Response::text()`, which buffers the entire body first no matter how
/// large it is. A user-supplied URL can point at a multi-gigabyte file; the
/// caller only ever wanted the first few kilobytes of it.
///
/// Takes the body by value: dropping it is what tells the server we are
/// done, where otherwise the connection would stay open until the rest of
/// the body had been transferred anyway. `None` (no body) reads as empty.
///
/// The bytes are decoded as UTF-8 the way a `TextDecoder` does: a leading
/// byte-order mark is dropped, and a malformed sequence, including a
/// character the limit cut in half, becomes U+FFFD.
pub async fn read_bounded<B: ChunkedBody>(
    body: Option<B>,
    max_bytes: usize,
) -> Result<String, B::Error> {
    let Some(mut body) = body else {
        return Ok(String::new());
    };

    let mut received: Vec<u8> = Vec::new();
    while received.len() < max_bytes {
        let Some(chunk) = body.next_chunk().await? else {
            break;
        };
        let chunk = chunk.as_ref();
        let remaining = max_bytes - received.len();
        received.extend_from_slice(&chunk[..chunk.len().min(remaining)]);
    }
    drop(body);

    let text = received.strip_prefix(UTF8_BOM).unwrap_or(&received);
    Ok(String::from_utf8_lossy(text).into_owned())
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::Arc;

    use super::*;
    use crate::infrastructure::net::stub_server::StubServer;

    /// A body made of fixed chunks that records being read and dropped.
    struct Chunks {
        chunks: VecDeque<Vec<u8>>,
        reads: Arc<AtomicUsize>,
        dropped: Arc<AtomicBool>,
    }

    impl Chunks {
        fn of(chunks: &[&str]) -> Self {
            Self {
                chunks: chunks.iter().map(|chunk| chunk.as_bytes().to_vec()).collect(),
                reads: Arc::default(),
                dropped: Arc::default(),
            }
        }
    }

    impl Drop for Chunks {
        fn drop(&mut self) {
            self.dropped.store(true, Ordering::SeqCst);
        }
    }

    #[async_trait]
    impl ChunkedBody for Chunks {
        type Chunk = Vec<u8>;
        type Error = String;

        async fn next_chunk(&mut self) -> Result<Option<Vec<u8>>, String> {
            self.reads.fetch_add(1, Ordering::SeqCst);
            Ok(self.chunks.pop_front())
        }
    }

    /// Never ends: every read yields another kilobyte.
    struct Infinite {
        reads: Arc<AtomicUsize>,
    }

    #[async_trait]
    impl ChunkedBody for Infinite {
        type Chunk = Vec<u8>;
        type Error = String;

        async fn next_chunk(&mut self) -> Result<Option<Vec<u8>>, String> {
            self.reads.fetch_add(1, Ordering::SeqCst);
            Ok(Some(vec![b'x'; 1024]))
        }
    }

    struct Failing;

    #[async_trait]
    impl ChunkedBody for Failing {
        type Chunk = Vec<u8>;
        type Error = String;

        async fn next_chunk(&mut self) -> Result<Option<Vec<u8>>, String> {
            Err("connection reset".to_string())
        }
    }

    #[tokio::test]
    async fn returns_an_empty_string_for_a_missing_body() {
        assert_eq!(read_bounded(None::<Chunks>, 100).await.unwrap(), "");
    }

    #[tokio::test]
    async fn returns_the_whole_body_when_it_fits() {
        let text = read_bounded(Some(Chunks::of(&["hello ", "world"])), 100).await.unwrap();
        assert_eq!(text, "hello world");
    }

    #[tokio::test]
    async fn stops_at_the_byte_limit_cutting_inside_a_chunk_if_needed() {
        let text = read_bounded(Some(Chunks::of(&["abcdef", "ghij"])), 8).await.unwrap();
        assert_eq!(text, "abcdefgh");
    }

    #[tokio::test]
    async fn stops_reading_and_drops_the_body_once_the_limit_is_reached() {
        let reads = Arc::new(AtomicUsize::new(0));

        let text = read_bounded(Some(Infinite { reads: reads.clone() }), 2048).await.unwrap();

        assert_eq!(text.len(), 2048);
        assert_eq!(reads.load(Ordering::SeqCst), 2);

        let body = Chunks::of(&["abcdef", "ghij", "never read"]);
        let (reads, dropped) = (body.reads.clone(), body.dropped.clone());
        read_bounded(Some(body), 8).await.unwrap();
        assert_eq!(reads.load(Ordering::SeqCst), 2);
        assert!(dropped.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn does_not_split_a_multi_byte_character_across_the_limit() {
        // "é" is two bytes; a 3-byte budget covers "a" + "é" but not the second "é".
        let text = read_bounded(Some(Chunks::of(&["aéé"])), 3).await.unwrap();
        assert_eq!(text, "aé");
    }

    #[tokio::test]
    async fn a_character_the_limit_cuts_in_half_becomes_a_replacement_character() {
        let text = read_bounded(Some(Chunks::of(&["aé"])), 2).await.unwrap();
        assert_eq!(text, "a\u{FFFD}");
    }

    #[tokio::test]
    async fn a_character_split_across_two_chunks_is_decoded_whole() {
        let body = Chunks {
            chunks: VecDeque::from([vec![b'a', 0xC3], vec![0xA9, b'b']]),
            reads: Arc::default(),
            dropped: Arc::default(),
        };
        assert_eq!(read_bounded(Some(body), 100).await.unwrap(), "aéb");
    }

    #[tokio::test]
    async fn drops_a_leading_byte_order_mark() {
        let text = read_bounded(Some(Chunks::of(&["\u{FEFF}hello"])), 100).await.unwrap();
        assert_eq!(text, "hello");
    }

    #[tokio::test]
    async fn reads_nothing_with_a_zero_budget() {
        let body = Chunks::of(&["abc"]);
        let reads = body.reads.clone();

        assert_eq!(read_bounded(Some(body), 0).await.unwrap(), "");
        assert_eq!(reads.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn passes_on_a_failure_to_read() {
        assert_eq!(read_bounded(Some(Failing), 100).await.unwrap_err(), "connection reset");
    }

    #[tokio::test]
    async fn reads_a_real_http_response_up_to_the_limit() {
        let server = StubServer::answering(200, "abcdefghij").await;
        let response = reqwest::get(&server.base_url).await.unwrap();

        assert_eq!(read_bounded(Some(response), 4).await.unwrap(), "abcd");
    }
}
