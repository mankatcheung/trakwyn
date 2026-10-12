use std::time::Duration;

use super::*;
use crate::use_cases::constants::resume_text_extraction::EXTRACT_TIMEOUT_MS;
use crate::use_cases::errors::ErrorCode;

const SAMPLE_PDF: &[u8] = include_bytes!("../../../../tests/fixtures/sample-resume.pdf");
const SAMPLE_DOCX: &[u8] = include_bytes!("../../../../tests/fixtures/sample-resume.docx");

async fn extract(bytes: &[u8], mime: &str) -> DomainResult<String> {
    DocumentTextExtractor::new().extract(bytes.to_vec(), mime).await
}

#[tokio::test]
async fn extracts_text_from_a_pdf() {
    let text = extract(SAMPLE_PDF, mime_type::PDF).await.unwrap();
    assert!(text.contains("Jane Doe"), "{text:?}");
    assert!(text.contains("Senior Software Engineer"), "{text:?}");
    assert!(text.starts_with(
        "Jane Doe \u{2014} Senior Software Engineer. Skills: TypeScript, React, GraphQL,"
    ));
    assert_eq!(text, text.trim());
}

#[tokio::test]
async fn extracts_text_from_a_docx() {
    let text = extract(SAMPLE_DOCX, mime_type::DOCX).await.unwrap();
    assert!(text.contains("Jane Doe"));
    assert!(text.contains("Senior Software Engineer"));
    // Exactly what mammoth's extractRawText returns for this file.
    assert_eq!(
        text,
        "Jane Doe \u{2014} Senior Software Engineer. Skills: TypeScript, React, GraphQL, PostgreSQL.\n\n"
    );
}

#[tokio::test]
async fn reads_plain_text_directly_as_utf8() {
    let text = extract(b"Plain text resume content", mime_type::TEXT_PLAIN).await.unwrap();
    assert_eq!(text, "Plain text resume content");
}

#[tokio::test]
async fn plain_text_keeps_its_whitespace_and_non_ascii_characters() {
    let source = "  R\u{e9}sum\u{e9}\r\n\tÅsa \u{2014} 日本語\n\n";
    assert_eq!(extract(source.as_bytes(), mime_type::TEXT_PLAIN).await.unwrap(), source);
}

#[tokio::test]
async fn plain_text_that_is_not_utf8_gets_replacement_characters() {
    let text = extract(b"caf\xe9 au lait", mime_type::TEXT_PLAIN).await.unwrap();
    assert_eq!(text, "caf\u{fffd} au lait");
}

#[tokio::test]
async fn fails_with_validation_for_legacy_doc_files() {
    let err = extract(b"irrelevant", mime_type::DOC).await.unwrap_err();
    assert_eq!(err.code(), ErrorCode::Validation);
    assert_eq!(
        err.to_string(),
        "This file type isn't supported for text extraction \u{2014} please paste your resume text instead."
    );
}

#[tokio::test]
async fn fails_with_validation_for_unsupported_mime_types() {
    for mime in [mime_type::PNG, mime_type::JPEG, "application/zip", "", "APPLICATION/PDF"] {
        let err = extract(b"irrelevant", mime).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Validation, "{mime}");
    }
}

#[tokio::test]
async fn a_corrupt_pdf_is_an_internal_error() {
    let err = extract(b"%PDF-1.7 not really", mime_type::PDF).await.unwrap_err();
    assert_eq!(err.code(), ErrorCode::InternalError);

    let truncated = &SAMPLE_PDF[..SAMPLE_PDF.len() / 3];
    let err = extract(truncated, mime_type::PDF).await.unwrap_err();
    assert_eq!(err.code(), ErrorCode::InternalError);
}

#[tokio::test]
async fn a_corrupt_docx_is_an_internal_error() {
    let err = extract(b"not a zip", mime_type::DOCX).await.unwrap_err();
    assert_eq!(err.code(), ErrorCode::InternalError);

    // A PDF uploaded with the wrong type.
    let err = extract(SAMPLE_PDF, mime_type::DOCX).await.unwrap_err();
    assert_eq!(err.code(), ErrorCode::InternalError);
}

#[tokio::test]
async fn extraction_fits_well_inside_the_callers_deadline() {
    // The use case bounds the call with this timeout; the future can be
    // wrapped and dropped like any other.
    let deadline = Duration::from_millis(EXTRACT_TIMEOUT_MS);
    let text = tokio::time::timeout(deadline, extract(SAMPLE_PDF, mime_type::PDF)).await;
    assert!(text.expect("within the deadline").is_ok());
}

#[tokio::test(flavor = "current_thread")]
async fn extraction_does_not_run_on_the_async_runtime() {
    // On a single-threaded runtime a ticker can only advance while the
    // extraction is awaited if the parsing happens on another thread.
    let ticks = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let counter = ticks.clone();
    let ticker = tokio::spawn(async move {
        loop {
            counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            tokio::task::yield_now().await;
        }
    });

    let mut longer = String::new();
    for _ in 0..20_000 {
        longer.push_str("A line of a long plain text resume.\n");
    }
    extract(SAMPLE_PDF, mime_type::PDF).await.unwrap();
    extract(longer.as_bytes(), mime_type::TEXT_PLAIN).await.unwrap();
    ticker.abort();

    assert!(ticks.load(std::sync::atomic::Ordering::SeqCst) > 0);
}
