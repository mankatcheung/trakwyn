use async_trait::async_trait;

use super::{docx, pdf_text};
use crate::use_cases::constants::mime_type;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::DocumentTextExtractor as DocumentTextExtractorPort;

const UNSUPPORTED_MESSAGE: &str =
    "This file type isn't supported for text extraction \u{2014} please paste your resume text instead.";

fn extract_pdf(bytes: &[u8]) -> DomainResult<String> {
    pdf_text::extract_text(bytes).map_err(DomainError::internal)
}

fn extract_blocking(bytes: &[u8], mime: &str) -> DomainResult<String> {
    match mime {
        mime_type::PDF => extract_pdf(bytes),
        mime_type::DOCX => docx::extract_raw_text(bytes).map_err(DomainError::internal),
        mime_type::TEXT_PLAIN => Ok(String::from_utf8_lossy(bytes).into_owned()),
        _ => Err(DomainError::validation(UNSUPPORTED_MESSAGE)),
    }
}

/// Reads the text of an uploaded PDF, `.docx` or plain-text file. Every
/// other type (legacy `.doc` and images included) is a `Validation` error
/// asking the user to paste the text instead.
#[derive(Debug, Clone, Copy, Default)]
pub struct DocumentTextExtractor;

impl DocumentTextExtractor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl DocumentTextExtractorPort for DocumentTextExtractor {
    async fn extract(&self, bytes: Vec<u8>, mime_type: &str) -> DomainResult<String> {
        let mime = mime_type.to_string();
        // Parsing is CPU-bound, and a hostile PDF can make the parser
        // panic; a panic surfaces here as a failed join, not a dead worker.
        tokio::task::spawn_blocking(move || extract_blocking(&bytes, &mime))
            .await
            .map_err(DomainError::internal)?
    }
}

#[cfg(test)]
mod tests;
