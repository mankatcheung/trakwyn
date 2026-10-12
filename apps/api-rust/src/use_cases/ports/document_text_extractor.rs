use async_trait::async_trait;

use crate::use_cases::errors::DomainResult;

/// Reads the text out of an uploaded document (a resume, a cover letter) so
/// it can be put in front of a model.
///
/// Fails with a `Validation` error for a MIME type it cannot read, and with
/// an internal error for a file that claims a supported type but does not
/// parse as one.
///
/// The work is CPU-bound and an implementation runs it off the async
/// runtime. It applies no deadline of its own: a caller on the request path
/// bounds it with `resume_text_extraction::EXTRACT_TIMEOUT_MS`, and dropping
/// the returned future is always safe.
#[async_trait]
pub trait DocumentTextExtractor: Send + Sync {
    async fn extract(&self, bytes: Vec<u8>, mime_type: &str) -> DomainResult<String>;
}
