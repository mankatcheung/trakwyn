use std::collections::VecDeque;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{DocumentTextExtractor, PdfRenderData, PdfRenderer};

/// Returns recognisable bytes instead of a real PDF, and remembers what it
/// was asked to render.
#[derive(Default)]
pub struct FakePdfRenderer {
    rendered: Mutex<Vec<PdfRenderData>>,
    failing: bool,
}

impl FakePdfRenderer {
    /// A renderer whose every render fails with an internal error.
    pub fn failing() -> Self {
        Self { failing: true, ..Self::default() }
    }

    /// The bytes a render of `data` produces: `pdf-content:` and the title.
    pub fn bytes_for(data: &PdfRenderData) -> Vec<u8> {
        format!("pdf-content:{}", data.title).into_bytes()
    }

    /// Everything rendered so far, in call order.
    pub fn rendered(&self) -> Vec<PdfRenderData> {
        self.rendered.lock().unwrap().clone()
    }
}

#[async_trait]
impl PdfRenderer for FakePdfRenderer {
    async fn render(&self, data: PdfRenderData) -> DomainResult<Vec<u8>> {
        let bytes = Self::bytes_for(&data);
        self.rendered.lock().unwrap().push(data);
        if self.failing {
            return Err(DomainError::internal("pdf rendering failed"));
        }
        Ok(bytes)
    }
}

/// One call a [`FakeDocumentTextExtractor`] received.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExtractCall {
    pub bytes: Vec<u8>,
    pub mime_type: String,
}

/// Answers with canned text: the queued results in order, then the default
/// (`"extracted resume text"`) for every call after them.
pub struct FakeDocumentTextExtractor {
    queued: Mutex<VecDeque<DomainResult<String>>>,
    default_text: String,
    calls: Mutex<Vec<ExtractCall>>,
}

impl Default for FakeDocumentTextExtractor {
    fn default() -> Self {
        Self::returning("extracted resume text")
    }
}

impl FakeDocumentTextExtractor {
    /// An extractor that answers every call with `text`.
    pub fn returning(text: &str) -> Self {
        Self {
            queued: Mutex::new(VecDeque::new()),
            default_text: text.to_string(),
            calls: Mutex::new(Vec::new()),
        }
    }

    /// Queues the text for the next unanswered call.
    pub fn then_text(self, text: &str) -> Self {
        self.queued.lock().unwrap().push_back(Ok(text.to_string()));
        self
    }

    /// Queues a failure for the next unanswered call.
    pub fn then_error(self, error: DomainError) -> Self {
        self.queued.lock().unwrap().push_back(Err(error));
        self
    }

    pub fn calls(&self) -> Vec<ExtractCall> {
        self.calls.lock().unwrap().clone()
    }
}

#[async_trait]
impl DocumentTextExtractor for FakeDocumentTextExtractor {
    async fn extract(&self, bytes: Vec<u8>, mime_type: &str) -> DomainResult<String> {
        self.calls.lock().unwrap().push(ExtractCall { bytes, mime_type: mime_type.to_string() });
        let queued = self.queued.lock().unwrap().pop_front();
        queued.unwrap_or_else(|| Ok(self.default_text.clone()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::errors::ErrorCode;

    fn data(title: &str) -> PdfRenderData {
        PdfRenderData { title: title.to_string(), content_json: "{}".to_string() }
    }

    #[tokio::test]
    async fn the_renderer_returns_recognisable_bytes_and_records_the_request() {
        let renderer = FakePdfRenderer::default();

        let bytes = renderer.render(data("Resume")).await.unwrap();

        assert_eq!(bytes, b"pdf-content:Resume");
        assert_eq!(bytes, FakePdfRenderer::bytes_for(&data("Resume")));
        assert_eq!(renderer.rendered(), vec![data("Resume")]);
    }

    #[tokio::test]
    async fn a_failing_renderer_still_records_the_request() {
        let renderer = FakePdfRenderer::failing();

        let err = renderer.render(data("Resume")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::InternalError);
        assert_eq!(renderer.rendered().len(), 1);
    }

    #[tokio::test]
    async fn the_extractor_answers_queued_results_then_its_default() {
        let extractor = FakeDocumentTextExtractor::default()
            .then_text("first")
            .then_error(DomainError::validation("unsupported"));

        assert_eq!(extractor.extract(b"a".to_vec(), "application/pdf").await.unwrap(), "first");
        let err = extractor.extract(b"b".to_vec(), "image/png").await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(
            extractor.extract(b"c".to_vec(), "text/plain").await.unwrap(),
            "extracted resume text"
        );

        let calls = extractor.calls();
        assert_eq!(calls.len(), 3);
        assert_eq!(calls[1], ExtractCall { bytes: b"b".to_vec(), mime_type: "image/png".into() });
    }

    #[tokio::test]
    async fn the_extractor_can_be_given_its_text() {
        let extractor = FakeDocumentTextExtractor::returning("  ");
        assert_eq!(extractor.extract(Vec::new(), "application/pdf").await.unwrap(), "  ");
    }
}
