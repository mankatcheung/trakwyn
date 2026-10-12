use async_trait::async_trait;

use crate::use_cases::errors::DomainResult;

/// What a document draft contributes to its exported PDF.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PdfRenderData {
    pub title: String,
    /// The draft's TipTap/ProseMirror document, as the JSON text it is stored as.
    pub content_json: String,
}

/// Renders a document draft to the bytes of a PDF file.
#[async_trait]
pub trait PdfRenderer: Send + Sync {
    async fn render(&self, data: PdfRenderData) -> DomainResult<Vec<u8>>;
}
