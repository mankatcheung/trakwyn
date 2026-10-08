//! The text of a PDF, in reading order.
//!
//! `pdf-extract` interprets the content streams and resolves each glyph to
//! its Unicode text and position; the line and word reconstruction here is
//! our own. Characters are taken in the order the file draws them, which is
//! the reading order for anything a word processor or a resume builder
//! exports. The result is plain text: a line per line of the page, a blank
//! line where the page leaves a paragraph-sized gap, pages separated by a
//! blank line. No Markdown structure is inferred.

use pdf_extract::{Document, MediaBox, OutputDev, OutputError, Transform};

/// A baseline shift beyond this fraction of the font size starts a new
/// line; a smaller one is a superscript or subscript on the same line.
const NEW_LINE_SHIFT: f64 = 0.5;
/// A line pitch beyond this multiple of the font size is a paragraph gap.
/// Body text is set at 1.0 to 1.5 times its size.
const PARAGRAPH_GAP: f64 = 1.9;
/// A horizontal gap beyond this fraction of the font size is a word space
/// the file did not draw as a space character.
const WORD_GAP: f64 = 0.15;

const PAGE_SEPARATOR: &str = "\n\n";

#[derive(Debug, thiserror::Error)]
#[error("the PDF could not be read: {0}")]
pub struct PdfTextError(String);

#[derive(Debug, Clone, Copy)]
struct LastCharacter {
    end_x: f64,
    y: f64,
    size: f64,
}

#[derive(Default)]
struct TextCollector {
    pages: Vec<String>,
    page: String,
    last: Option<LastCharacter>,
}

impl TextCollector {
    fn ends_with_whitespace(&self) -> bool {
        self.page.chars().next_back().is_none_or(char::is_whitespace)
    }
}

impl OutputDev for TextCollector {
    fn begin_page(
        &mut self,
        _page_num: u32,
        _media_box: &MediaBox,
        _art_box: Option<(f64, f64, f64, f64)>,
    ) -> Result<(), OutputError> {
        self.page.clear();
        self.last = None;
        Ok(())
    }

    fn end_page(&mut self) -> Result<(), OutputError> {
        self.pages.push(std::mem::take(&mut self.page));
        Ok(())
    }

    fn output_character(
        &mut self,
        trm: &Transform,
        width: f64,
        _spacing: f64,
        font_size: f64,
        text: &str,
    ) -> Result<(), OutputError> {
        let (x, y) = (trm.m31, trm.m32);
        // The side of the square with the area of the transformed em box.
        let scale_x = (trm.m11 + trm.m21) * font_size;
        let scale_y = (trm.m12 + trm.m22) * font_size;
        let size = match (scale_x * scale_y).abs().sqrt() {
            size if size.is_finite() && size > 0.0 => size,
            _ => font_size.abs(),
        };

        if let Some(last) = self.last {
            let shift = (y - last.y).abs();
            if shift > NEW_LINE_SHIFT * size.min(last.size) {
                self.page.push('\n');
                if shift > PARAGRAPH_GAP * size.max(last.size) {
                    self.page.push('\n');
                }
            } else if x > last.end_x + WORD_GAP * size
                && !self.ends_with_whitespace()
                && !text.starts_with(char::is_whitespace)
            {
                self.page.push(' ');
            }
        }

        self.page.push_str(text);
        self.last = Some(LastCharacter { end_x: x + width * size, y, size });
        Ok(())
    }

    fn begin_word(&mut self) -> Result<(), OutputError> {
        Ok(())
    }

    fn end_word(&mut self) -> Result<(), OutputError> {
        Ok(())
    }

    fn end_line(&mut self) -> Result<(), OutputError> {
        Ok(())
    }
}

/// Tidies one page: no trailing spaces on a line, at most one blank line in
/// a row, no leading or trailing blank lines.
fn normalise(raw: &str) -> String {
    let mut text = String::with_capacity(raw.len());
    let mut blank_line_pending = false;
    for line in raw.lines() {
        let line = line.trim_end();
        if line.is_empty() {
            blank_line_pending = true;
            continue;
        }
        if !text.is_empty() {
            text.push('\n');
            if blank_line_pending {
                text.push('\n');
            }
        }
        blank_line_pending = false;
        text.push_str(line);
    }
    text
}

fn read_error(err: impl std::fmt::Display) -> PdfTextError {
    PdfTextError(err.to_string())
}

/// The text of each page, tidied; a page with no text is the empty string.
pub fn extract_pages(bytes: &[u8]) -> Result<Vec<String>, PdfTextError> {
    let mut document = Document::load_mem(bytes).map_err(read_error)?;
    if document.is_encrypted() {
        // A file encrypted only to restrict printing or copying opens with
        // the empty password.
        document.decrypt("").map_err(read_error)?;
    }

    let mut collector = TextCollector::default();
    pdf_extract::output_doc(&document, &mut collector).map_err(read_error)?;
    Ok(collector.pages.iter().map(|page| normalise(page)).collect())
}

pub fn extract_text(bytes: &[u8]) -> Result<String, PdfTextError> {
    let pages = extract_pages(bytes)?;
    let with_text: Vec<&str> =
        pages.iter().map(String::as_str).filter(|page| !page.is_empty()).collect();
    Ok(with_text.join(PAGE_SEPARATOR))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identity_at(x: f64, y: f64) -> Transform {
        Transform::row_major(1.0, 0.0, 0.0, 1.0, x, y)
    }

    /// Draws `text` left to right from (`x`, `y`) in a font whose glyphs are
    /// all half an em wide.
    fn draw(collector: &mut TextCollector, text: &str, x: f64, y: f64, size: f64) {
        for (index, ch) in text.chars().enumerate() {
            let at = identity_at(x + index as f64 * 0.5 * size, y);
            collector.output_character(&at, 0.5, 0.0, size, &ch.to_string()).unwrap();
        }
    }

    #[test]
    fn characters_on_one_baseline_are_one_line() {
        let mut collector = TextCollector::default();
        draw(&mut collector, "Jane Doe", 40.0, 800.0, 10.0);
        assert_eq!(collector.page, "Jane Doe");
    }

    #[test]
    fn a_gap_between_runs_is_a_space_unless_one_was_drawn() {
        let mut collector = TextCollector::default();
        draw(&mut collector, "Skills:", 40.0, 800.0, 10.0);
        draw(&mut collector, "Rust", 80.0, 800.0, 10.0);
        draw(&mut collector, " and", 100.0, 800.0, 10.0);
        // Adjacent: starts exactly where the last run ended.
        draw(&mut collector, "SQL", 120.0, 800.0, 10.0);
        assert_eq!(collector.page, "Skills: Rust andSQL");

        let mut collector = TextCollector::default();
        draw(&mut collector, "a ", 40.0, 800.0, 10.0);
        draw(&mut collector, "b", 60.0, 800.0, 10.0);
        assert_eq!(collector.page, "a b");
    }

    #[test]
    fn a_baseline_change_is_a_new_line_and_a_large_one_a_blank_line() {
        let mut collector = TextCollector::default();
        draw(&mut collector, "one", 40.0, 800.0, 10.0);
        draw(&mut collector, "two", 40.0, 785.0, 10.0);
        draw(&mut collector, "three", 40.0, 760.0, 10.0);
        // A short line followed by an indented one is still a new line.
        draw(&mut collector, "four", 200.0, 745.0, 10.0);
        assert_eq!(collector.page, "one\ntwo\n\nthree\nfour");
    }

    #[test]
    fn a_superscript_stays_on_its_line() {
        let mut collector = TextCollector::default();
        draw(&mut collector, "E=mc", 40.0, 800.0, 10.0);
        draw(&mut collector, "2", 60.0, 803.0, 6.0);
        assert_eq!(collector.page, "E=mc2");
    }

    #[test]
    fn the_font_size_follows_the_text_matrix() {
        // A 1pt font scaled 12x by the matrix: 15pt down is one line pitch, not a paragraph gap.
        let mut collector = TextCollector::default();
        let scaled = |x: f64, y: f64| Transform::row_major(12.0, 0.0, 0.0, 12.0, x, y);
        collector.output_character(&scaled(40.0, 800.0), 0.5, 0.0, 1.0, "a").unwrap();
        collector.output_character(&scaled(40.0, 785.0), 0.5, 0.0, 1.0, "b").unwrap();
        collector.output_character(&scaled(60.0, 785.0), 0.5, 0.0, 1.0, "c").unwrap();
        assert_eq!(collector.page, "a\nb c");
    }

    #[test]
    fn pages_are_collected_separately() {
        let mut collector = TextCollector::default();
        let media_box = MediaBox { llx: 0.0, lly: 0.0, urx: 595.0, ury: 842.0 };
        collector.begin_page(1, &media_box, None).unwrap();
        draw(&mut collector, "first", 40.0, 100.0, 10.0);
        collector.end_page().unwrap();
        collector.begin_page(2, &media_box, None).unwrap();
        draw(&mut collector, "second", 40.0, 800.0, 10.0);
        collector.end_page().unwrap();
        assert_eq!(collector.pages, vec!["first", "second"]);
    }

    #[test]
    fn normalising_drops_trailing_spaces_and_extra_blank_lines() {
        assert_eq!(
            normalise("\n\nJane Doe  \n\n\n\nSkills \nRust\n\n"),
            "Jane Doe\n\nSkills\nRust"
        );
        assert_eq!(normalise("a  b\n\nc"), "a  b\n\nc");
        assert_eq!(normalise(" \n \n"), "");
    }

    #[test]
    fn bytes_that_are_not_a_pdf_are_rejected() {
        assert!(extract_text(b"not a pdf").is_err());
        assert!(extract_text(b"").is_err());
    }
}
