//! Flowing styled blocks onto A4 pages: line breaking and pagination.
//!
//! Pure geometry over a [`FontMetrics`] source, so it is tested without a
//! font file or a PDF writer. Coordinates are PDF points with the origin at
//! the page's top-left corner and `y` growing downwards.

use super::prosemirror::{Block, FontFace, TextStyle};

/// A4, in points.
pub const PAGE_WIDTH: f32 = 595.28;
pub const PAGE_HEIGHT: f32 = 841.89;
/// The margin on all four sides.
pub const PAGE_PADDING: f32 = 40.0;
/// A line's height as a multiple of its font size.
pub const LINE_HEIGHT: f32 = 1.5;

/// What the layout needs to know about the fonts. Lengths are in em units
/// (fractions of the font size).
pub trait FontMetrics {
    /// The horizontal advance of the glyph that will be drawn for `ch`.
    fn advance(&self, face: FontFace, ch: char) -> f32;
    /// Height above the baseline.
    fn ascent(&self, face: FontFace) -> f32;
    /// Depth below the baseline, as a positive length.
    fn descent(&self, face: FontFace) -> f32;
}

/// Text in one style, drawn from `x` along `baseline`.
#[derive(Debug, Clone, PartialEq)]
pub struct PlacedRun {
    pub text: String,
    pub style: TextStyle,
    pub x: f32,
    pub baseline: f32,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct PageLayout {
    pub runs: Vec<PlacedRun>,
}

#[derive(Debug, Clone, Copy)]
struct Glyph {
    ch: char,
    style: TextStyle,
    width: f32,
}

#[derive(Debug, Default)]
struct Line {
    glyphs: Vec<Glyph>,
    /// The style an empty line takes its height from.
    fallback_style: Option<TextStyle>,
}

fn width_of(glyphs: &[Glyph]) -> f32 {
    glyphs.iter().map(|glyph| glyph.width).sum()
}

/// Greedy line breaking for one block.
///
/// Lines break at spaces, and at a newline in the text. Spaces at a wrapped
/// line's edges are dropped; spaces at the start of the block are kept. A
/// word wider than the whole line is split between characters. There is no
/// hyphenation.
struct LineBreaker {
    max_width: f32,
    lines: Vec<Line>,
    line: Vec<Glyph>,
    line_width: f32,
    /// Whether the current line was started by wrapping, not by the block or a newline.
    wrapped: bool,
    spaces: Vec<Glyph>,
    word: Vec<Glyph>,
    last_style: Option<TextStyle>,
}

impl LineBreaker {
    fn new(max_width: f32) -> Self {
        Self {
            max_width,
            lines: Vec::new(),
            line: Vec::new(),
            line_width: 0.0,
            wrapped: false,
            spaces: Vec::new(),
            word: Vec::new(),
            last_style: None,
        }
    }

    fn push(&mut self, glyph: Glyph) {
        self.last_style = Some(glyph.style);
        match glyph.ch {
            '\n' => {
                self.flush_word();
                self.end_line(false);
            }
            ' ' => {
                self.flush_word();
                self.spaces.push(glyph);
            }
            _ => self.word.push(glyph),
        }
    }

    fn end_line(&mut self, wrapped: bool) {
        self.lines
            .push(Line { glyphs: std::mem::take(&mut self.line), fallback_style: self.last_style });
        self.line_width = 0.0;
        self.wrapped = wrapped;
        self.spaces.clear();
    }

    fn append(&mut self, glyphs: Vec<Glyph>) {
        self.line_width += width_of(&glyphs);
        self.line.extend(glyphs);
    }

    fn flush_word(&mut self) {
        if self.word.is_empty() {
            return;
        }
        let word = std::mem::take(&mut self.word);
        let spaces = std::mem::take(&mut self.spaces);
        let word_width = width_of(&word);

        let at_wrapped_start = self.line.is_empty() && self.wrapped;
        let spaces = if at_wrapped_start { Vec::new() } else { spaces };

        if self.line_width + width_of(&spaces) + word_width <= self.max_width {
            self.append(spaces);
            self.append(word);
            return;
        }

        if !self.line.is_empty() {
            self.end_line(true);
        }
        if word_width <= self.max_width {
            self.append(word);
            return;
        }
        // One word wider than the line: fill each line with as many
        // characters as fit, always at least one.
        for glyph in word {
            if !self.line.is_empty() && self.line_width + glyph.width > self.max_width {
                self.end_line(true);
            }
            self.append(vec![glyph]);
        }
    }

    fn finish(mut self) -> Vec<Line> {
        self.flush_word();
        if !self.line.is_empty() {
            self.end_line(false);
        }
        self.lines
    }
}

fn break_lines(block: &Block, max_width: f32, metrics: &dyn FontMetrics) -> Vec<Line> {
    let mut breaker = LineBreaker::new(max_width);
    for span in &block.spans {
        for ch in span.text.chars() {
            let ch = if ch == '\t' { ' ' } else { ch };
            if ch.is_control() && ch != '\n' {
                continue;
            }
            let width = if ch == '\n' {
                0.0
            } else {
                metrics.advance(span.style.face, ch) * span.style.size
            };
            breaker.push(Glyph { ch, style: span.style, width });
        }
    }
    breaker.finish()
}

/// The style that sets a line's height: its largest text.
fn tallest_style(line: &Line) -> Option<TextStyle> {
    line.glyphs
        .iter()
        .map(|glyph| glyph.style)
        .reduce(|tallest, style| if style.size > tallest.size { style } else { tallest })
        .or(line.fallback_style)
}

fn place_line(line: &Line, x: f32, baseline: f32, runs: &mut Vec<PlacedRun>) {
    let mut cursor = x;
    let mut current: Option<PlacedRun> = None;
    for glyph in &line.glyphs {
        match current.as_mut() {
            Some(run) if run.style == glyph.style => run.text.push(glyph.ch),
            _ => {
                runs.extend(current.take());
                current = Some(PlacedRun {
                    text: glyph.ch.to_string(),
                    style: glyph.style,
                    x: cursor,
                    baseline,
                });
            }
        }
        cursor += glyph.width;
    }
    runs.extend(current);
}

/// Lays the blocks out top to bottom, starting a new page whenever the next
/// line would cross the bottom margin. Always returns at least one page.
///
/// Margins do not collapse: a block's bottom margin and the next block's top
/// margin add up. A block with no text takes no height beyond its margins.
pub fn layout(blocks: &[Block], metrics: &dyn FontMetrics) -> Vec<PageLayout> {
    let bottom = PAGE_HEIGHT - PAGE_PADDING;
    let mut pages = vec![PageLayout::default()];
    let mut y = PAGE_PADDING;

    for block in blocks {
        y += block.margin_top;
        let x = PAGE_PADDING + block.padding_left;
        let max_width = PAGE_WIDTH - 2.0 * PAGE_PADDING - block.padding_left;

        for line in break_lines(block, max_width, metrics) {
            let Some(style) = tallest_style(&line) else {
                continue;
            };
            let line_height = style.size * LINE_HEIGHT;
            if y + line_height > bottom && y > PAGE_PADDING {
                pages.push(PageLayout::default());
                y = PAGE_PADDING;
            }

            // The glyphs sit in the middle of the line box.
            let ascent = metrics.ascent(style.face) * style.size;
            let descent = metrics.descent(style.face) * style.size;
            let baseline = y + (line_height - (ascent + descent)) / 2.0 + ascent;
            if let Some(page) = pages.last_mut() {
                place_line(&line, x, baseline, &mut page.runs);
            }
            y += line_height;
        }

        y += block.margin_bottom;
    }

    pages
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::pdf::prosemirror::Span;

    /// Every character is half an em wide; the font is one em tall.
    struct Monospace;

    impl FontMetrics for Monospace {
        fn advance(&self, _face: FontFace, _ch: char) -> f32 {
            0.5
        }
        fn ascent(&self, _face: FontFace) -> f32 {
            0.8
        }
        fn descent(&self, _face: FontFace) -> f32 {
            0.2
        }
    }

    const BODY: TextStyle = TextStyle { face: FontFace::Regular, size: 10.0 };
    /// (595.28 - 80) / (0.5 * 10)
    const CHARS_PER_LINE: usize = 103;

    fn block(text: &str) -> Block {
        Block {
            spans: vec![Span { text: text.to_string(), style: BODY }],
            margin_top: 0.0,
            margin_bottom: 0.0,
            padding_left: 0.0,
        }
    }

    fn lines_of(page: &PageLayout) -> Vec<String> {
        let mut lines: Vec<(f32, String)> = Vec::new();
        for run in &page.runs {
            match lines.last_mut() {
                Some((baseline, text)) if *baseline == run.baseline => text.push_str(&run.text),
                _ => lines.push((run.baseline, run.text.clone())),
            }
        }
        lines.into_iter().map(|(_, text)| text).collect()
    }

    #[test]
    fn no_blocks_is_one_empty_page() {
        assert_eq!(layout(&[], &Monospace), vec![PageLayout::default()]);
    }

    #[test]
    fn a_short_block_is_one_run_at_the_top_left_margin() {
        let pages = layout(&[block("Hello world")], &Monospace);
        assert_eq!(pages.len(), 1);
        let run = &pages[0].runs[0];
        assert_eq!(run.text, "Hello world");
        assert_eq!(run.x, 40.0);
        // Line box 15pt, glyph box 10pt: 2.5pt of leading above, then 8pt of ascent.
        assert_eq!(run.baseline, 40.0 + 2.5 + 8.0);
    }

    #[test]
    fn wraps_at_spaces_and_drops_the_space_at_the_break() {
        let word = "x".repeat(60);
        let pages = layout(&[block(&format!("{word} {word} {word}"))], &Monospace);
        assert_eq!(lines_of(&pages[0]), vec![word.clone(), word.clone(), word]);
        let baselines: Vec<f32> = pages[0].runs.iter().map(|run| run.baseline).collect();
        assert_eq!(baselines, vec![50.5, 65.5, 80.5]);
    }

    #[test]
    fn fills_a_line_exactly_to_the_margin() {
        let first = "a".repeat(CHARS_PER_LINE - 2);
        let pages = layout(&[block(&format!("{first} b c"))], &Monospace);
        assert_eq!(lines_of(&pages[0]), vec![format!("{first} b"), "c".to_string()]);
    }

    #[test]
    fn splits_a_word_longer_than_the_line() {
        let pages = layout(&[block(&"y".repeat(CHARS_PER_LINE * 2 + 5))], &Monospace);
        let lengths: Vec<usize> = lines_of(&pages[0]).iter().map(String::len).collect();
        assert_eq!(lengths, vec![CHARS_PER_LINE, CHARS_PER_LINE, 5]);
    }

    #[test]
    fn a_newline_in_the_text_breaks_the_line() {
        let pages = layout(&[block("one\ntwo\n\nfour")], &Monospace);
        assert_eq!(lines_of(&pages[0]), vec!["one", "two", "four"]);
        let baselines: Vec<f32> = pages[0].runs.iter().map(|run| run.baseline).collect();
        // The empty third line still takes a line's height.
        assert_eq!(baselines, vec![50.5, 65.5, 95.5]);
    }

    #[test]
    fn keeps_interior_and_leading_spaces() {
        let pages = layout(&[block("  a  b ")], &Monospace);
        assert_eq!(lines_of(&pages[0]), vec!["  a  b"]);
    }

    #[test]
    fn a_style_change_starts_a_new_run_where_the_last_ended() {
        let bold = TextStyle { face: FontFace::Bold, size: 10.0 };
        let mixed = Block {
            spans: vec![
                Span { text: "ab ".to_string(), style: BODY },
                Span { text: "cd".to_string(), style: bold },
                Span { text: "ef".to_string(), style: BODY },
            ],
            ..block("")
        };
        let pages = layout(&[mixed], &Monospace);
        let runs: Vec<(&str, FontFace, f32)> =
            pages[0].runs.iter().map(|run| (run.text.as_str(), run.style.face, run.x)).collect();
        assert_eq!(
            runs,
            vec![
                ("ab ", FontFace::Regular, 40.0),
                ("cd", FontFace::Bold, 55.0),
                ("ef", FontFace::Regular, 65.0),
            ]
        );
    }

    #[test]
    fn margins_add_up_and_padding_indents() {
        let first = Block { margin_bottom: 8.0, ..block("first") };
        let second = Block { margin_top: 16.0, padding_left: 16.0, ..block("second") };
        let pages = layout(&[first, second], &Monospace);
        assert_eq!(pages[0].runs[1].x, 56.0);
        assert_eq!(pages[0].runs[1].baseline - pages[0].runs[0].baseline, 15.0 + 8.0 + 16.0);
    }

    #[test]
    fn padding_narrows_the_line() {
        let text = "z".repeat(CHARS_PER_LINE);
        let indented = Block { padding_left: 16.0, ..block(&text) };
        assert_eq!(lines_of(&layout(&[block(&text)], &Monospace)[0]).len(), 1);
        assert_eq!(lines_of(&layout(&[indented], &Monospace)[0]).len(), 2);
    }

    #[test]
    fn an_empty_block_takes_only_its_margins() {
        let empty = Block { margin_bottom: 8.0, ..block("") };
        let pages = layout(&[block("a"), empty, block("b")], &Monospace);
        assert_eq!(pages[0].runs[1].baseline - pages[0].runs[0].baseline, 15.0 + 8.0);
    }

    #[test]
    fn a_line_is_as_tall_as_its_largest_text() {
        let big = TextStyle { face: FontFace::Bold, size: 20.0 };
        let mixed = Block {
            spans: vec![
                Span { text: "small ".to_string(), style: BODY },
                Span { text: "BIG".to_string(), style: big },
            ],
            ..block("")
        };
        let pages = layout(&[mixed, block("next")], &Monospace);
        assert_eq!(pages[0].runs[0].baseline, pages[0].runs[1].baseline);
        assert_eq!(
            pages[0].runs[2].baseline - pages[0].runs[0].baseline,
            30.0 - 5.0 - 16.0 + 2.5 + 8.0
        );
    }

    #[test]
    fn starts_a_new_page_when_a_line_would_cross_the_bottom_margin() {
        // (841.89 - 80) / 15 = 50.79: fifty lines fit on a page.
        let blocks: Vec<Block> = (0..120).map(|n| block(&format!("line {n}"))).collect();
        let pages = layout(&blocks, &Monospace);

        let counts: Vec<usize> = pages.iter().map(|page| page.runs.len()).collect();
        assert_eq!(counts, vec![50, 50, 20]);
        assert_eq!(pages[1].runs[0].text, "line 50");
        assert_eq!(pages[1].runs[0].baseline, 50.5);
        for page in &pages {
            for run in &page.runs {
                assert!(run.baseline < PAGE_HEIGHT - PAGE_PADDING);
            }
        }
    }

    #[test]
    fn one_long_paragraph_flows_across_pages() {
        let text = vec!["word"; 5000].join(" ");
        let pages = layout(&[block(&text)], &Monospace);
        assert!(pages.len() > 1);
        let words: usize =
            pages.iter().flat_map(lines_of).map(|line| line.split(' ').count()).sum();
        assert_eq!(words, 5000);
    }
}
