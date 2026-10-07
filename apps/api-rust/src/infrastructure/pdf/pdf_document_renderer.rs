use async_trait::async_trait;
use krilla::geom::Point;
use krilla::page::PageSettings;
use krilla::text::{Font, GlyphId, KrillaGlyph};
use krilla::Document;

use super::layout::{layout, FontMetrics, PageLayout, PAGE_HEIGHT, PAGE_WIDTH};
use super::prosemirror::{document_blocks, FontFace};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{PdfRenderData, PdfRenderer};

// Liberation Sans is metric-compatible with Helvetica, the font `apps/api`
// renders with, so text wraps where it does there. Licence:
// assets/fonts/LICENSE-LiberationFonts.txt (SIL OFL 1.1).
const REGULAR_TTF: &[u8] = include_bytes!("../../../assets/fonts/LiberationSans-Regular.ttf");
const BOLD_TTF: &[u8] = include_bytes!("../../../assets/fonts/LiberationSans-Bold.ttf");
const ITALIC_TTF: &[u8] = include_bytes!("../../../assets/fonts/LiberationSans-Italic.ttf");

/// The glyph a font draws for a character it has no glyph for.
const MISSING_GLYPH: u16 = 0;

#[derive(Debug, thiserror::Error)]
enum RenderError {
    #[error("the bundled {0:?} font could not be loaded")]
    Font(FontFace),
    #[error("the page size is not valid")]
    PageSize,
    #[error("writing the PDF failed: {0}")]
    Write(String),
}

/// One bundled font, opened twice: for its metrics and for embedding.
struct LoadedFont {
    metrics: ttf_parser::Face<'static>,
    embedded: Font,
}

impl LoadedFont {
    fn load(face: FontFace, data: &'static [u8]) -> Result<Self, RenderError> {
        let metrics = ttf_parser::Face::parse(data, 0).map_err(|_| RenderError::Font(face))?;
        let embedded = Font::new(data.into(), 0).ok_or(RenderError::Font(face))?;
        Ok(Self { metrics, embedded })
    }

    fn units_per_em(&self) -> f32 {
        f32::from(self.metrics.units_per_em())
    }

    fn glyph(&self, ch: char) -> ttf_parser::GlyphId {
        self.metrics.glyph_index(ch).unwrap_or(ttf_parser::GlyphId(MISSING_GLYPH))
    }

    /// The glyph's advance, in em units.
    fn advance(&self, glyph: ttf_parser::GlyphId) -> f32 {
        f32::from(self.metrics.glyph_hor_advance(glyph).unwrap_or(0)) / self.units_per_em()
    }
}

struct Fonts {
    regular: LoadedFont,
    bold: LoadedFont,
    italic: LoadedFont,
}

impl Fonts {
    fn load() -> Result<Self, RenderError> {
        Ok(Self {
            regular: LoadedFont::load(FontFace::Regular, REGULAR_TTF)?,
            bold: LoadedFont::load(FontFace::Bold, BOLD_TTF)?,
            italic: LoadedFont::load(FontFace::Italic, ITALIC_TTF)?,
        })
    }

    fn get(&self, face: FontFace) -> &LoadedFont {
        match face {
            FontFace::Regular => &self.regular,
            FontFace::Bold => &self.bold,
            FontFace::Italic => &self.italic,
        }
    }
}

impl FontMetrics for Fonts {
    fn advance(&self, face: FontFace, ch: char) -> f32 {
        let font = self.get(face);
        font.advance(font.glyph(ch))
    }

    fn ascent(&self, face: FontFace) -> f32 {
        let font = self.get(face);
        f32::from(font.metrics.ascender()) / font.units_per_em()
    }

    fn descent(&self, face: FontFace) -> f32 {
        let font = self.get(face);
        -f32::from(font.metrics.descender()) / font.units_per_em()
    }
}

fn write_pdf(pages: &[PageLayout], fonts: &Fonts) -> Result<Vec<u8>, RenderError> {
    let mut document = Document::new();

    for page_layout in pages {
        let settings =
            PageSettings::from_wh(PAGE_WIDTH, PAGE_HEIGHT).ok_or(RenderError::PageSize)?;
        let mut page = document.start_page_with(settings);
        let mut surface = page.surface();

        for run in &page_layout.runs {
            let font = fonts.get(run.style.face);
            // One glyph per character, each mapped back to its bytes in the
            // run so the text can be selected, searched and extracted.
            let glyphs: Vec<KrillaGlyph> = run
                .text
                .char_indices()
                .map(|(start, ch)| {
                    let glyph = font.glyph(ch);
                    KrillaGlyph::new(
                        GlyphId::new(u32::from(glyph.0)),
                        font.advance(glyph),
                        0.0,
                        0.0,
                        0.0,
                        start..start + ch.len_utf8(),
                        None,
                    )
                })
                .collect();

            surface.draw_glyphs(
                Point::from_xy(run.x, run.baseline),
                &glyphs,
                font.embedded.clone(),
                &run.text,
                run.style.size,
                false,
            );
        }

        surface.finish();
        page.finish();
    }

    document.finish().map_err(|err| RenderError::Write(format!("{err:?}")))
}

fn render_blocking(data: &PdfRenderData) -> DomainResult<Vec<u8>> {
    let blocks = document_blocks(&data.title, &data.content_json).map_err(DomainError::internal)?;
    let fonts = Fonts::load().map_err(DomainError::internal)?;
    let pages = layout(&blocks, &fonts);
    write_pdf(&pages, &fonts).map_err(DomainError::internal)
}

/// Renders a draft to a PDF: A4 pages with a 40pt margin, the title in 18pt
/// bold, then the content in 11pt with 1.5 line spacing.
///
/// The layout is `apps/api`'s `ReactPdfDocumentRenderer`'s; see
/// [`super::prosemirror`] for which nodes and marks are understood. The fonts
/// are embedded (subset to the glyphs used), so any text Liberation Sans
/// covers (Latin, Greek, Cyrillic and common symbols) renders as written.
#[derive(Debug, Clone, Copy, Default)]
pub struct PdfDocumentRenderer;

impl PdfDocumentRenderer {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl PdfRenderer for PdfDocumentRenderer {
    async fn render(&self, data: PdfRenderData) -> DomainResult<Vec<u8>> {
        // Shaping and font subsetting are CPU-bound.
        tokio::task::spawn_blocking(move || render_blocking(&data))
            .await
            .map_err(DomainError::internal)?
    }
}

#[cfg(test)]
mod tests;
