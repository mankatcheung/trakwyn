use std::error::Error;

use serde_json::json;

use super::*;
use crate::infrastructure::net::stub_server::{
    unreachable_base_url, RecordedRequest, StubResponse, StubServer,
};
use crate::use_cases::errors::ErrorCode;

const TOKEN: &str = "vercel_blob_rw_STOREID123_secretpart";

fn provider(server: &StubServer) -> VercelBlobStorageProvider {
    VercelBlobStorageProvider::new(
        reqwest::Client::new(),
        format!("{}/api/blob", server.base_url),
        TOKEN,
    )
    .with_retry(BlobRetry::NONE)
}

fn unconfigured(server: &StubServer) -> VercelBlobStorageProvider {
    VercelBlobStorageProvider::new(
        reqwest::Client::new(),
        format!("{}/api/blob", server.base_url),
        "",
    )
}

fn blob_error(status: u16, code: &str, message: &str) -> StubResponse {
    StubResponse::json(status, json!({ "error": { "code": code, "message": message } }))
}

/// The text of the infrastructure failure a call was refused with.
fn failure<T: std::fmt::Debug>(result: DomainResult<T>) -> String {
    let err = result.unwrap_err();
    assert_eq!(err.code(), ErrorCode::InternalError);
    err.source().unwrap().to_string()
}

fn assert_common_headers(request: &RecordedRequest, attempt: &str) {
    assert_eq!(request.header("authorization"), Some(format!("Bearer {TOKEN}").as_str()));
    assert_eq!(request.header("x-api-version"), Some("12"));
    assert_eq!(request.header("x-vercel-blob-store-id"), Some("STOREID123"));
    assert_eq!(request.header("x-api-blob-request-attempt"), Some(attempt));

    let request_id: Vec<&str> =
        request.header("x-api-blob-request-id").unwrap().split(':').collect();
    assert_eq!(request_id.len(), 3);
    assert_eq!(request_id[0], "STOREID123");
    assert!(request_id[1].parse::<i64>().unwrap() > 1_700_000_000_000);
    assert_eq!(request_id[2].len(), 13);
    assert!(request_id[2].chars().all(|c| HEX_DIGITS.contains(&c)));
}

#[test]
fn the_production_endpoint_is_vercels() {
    assert_eq!(VERCEL_BLOB_API_URL, "https://vercel.com/api/blob");
}

// ── get_presigned_upload_url ────────────────────────────────────────

/// The expected token is what `generateClientTokenFromReadWriteToken`
/// from `@vercel/blob` 2.8.0 returns for the same token, pathname,
/// content type and expiry.
#[tokio::test]
async fn signs_the_same_client_token_as_the_vercel_sdk() {
    let server = StubServer::answering(200, "{}").await;

    let token = provider(&server)
        .client_token(
            "users/u1/applications/a1/résumé \"final\".pdf",
            "application/pdf",
            1_791_000_000_000,
        )
        .unwrap();

    assert_eq!(
        token,
        "vercel_blob_client_STOREID123_N2Q1NzQ1ZTdiNTI1NDk0NzczYjAyYTA5YmRlNDNmMDViNTBjZjljMDMwZmI5Y2NlOGQ3YjFjMDZlZTA3YjAyZi5leUp3WVhSb2JtRnRaU0k2SW5WelpYSnpMM1V4TDJGd2NHeHBZMkYwYVc5dWN5OWhNUzl5dzZsemRXM0RxU0JjSW1acGJtRnNYQ0l1Y0dSbUlpd2lZV3hzYjNkbFpFTnZiblJsYm5SVWVYQmxjeUk2V3lKaGNIQnNhV05oZEdsdmJpOXdaR1lpWFN3aVlXUmtVbUZ1Wkc5dFUzVm1abWw0SWpwbVlXeHpaU3dpZG1Gc2FXUlZiblJwYkNJNk1UYzVNVEF3TURBd01EQXdNSDA9"
    );
    assert!(server.requests().is_empty());
}

#[tokio::test]
async fn an_upload_token_grants_one_pathname_and_content_type_for_five_minutes_by_default() {
    let server = StubServer::answering(200, "{}").await;
    let provider = provider(&server);
    let before = clock::now().timestamp_millis();

    let token = provider
        .get_presigned_upload_url("users/u1/applications/a1/cv.pdf", "application/pdf", None)
        .await
        .unwrap();
    let short = provider
        .get_presigned_upload_url("users/u1/applications/a1/cv.pdf", "application/pdf", Some(60))
        .await
        .unwrap();

    let grant = |token: &str| -> serde_json::Value {
        let encoded = token.strip_prefix("vercel_blob_client_STOREID123_").unwrap();
        let decoded = String::from_utf8(BASE64.decode(encoded).unwrap()).unwrap();
        let (signature, payload) = decoded.split_once('.').unwrap();
        assert_eq!(signature.len(), 64);
        serde_json::from_slice(&BASE64.decode(payload).unwrap()).unwrap()
    };
    let payload = grant(&token);
    assert_eq!(payload["pathname"], "users/u1/applications/a1/cv.pdf");
    assert_eq!(payload["allowedContentTypes"], json!(["application/pdf"]));
    assert_eq!(payload["addRandomSuffix"], false);
    let valid_until = payload["validUntil"].as_i64().unwrap();
    assert!((before + 300_000..=before + 305_000).contains(&valid_until), "{valid_until}");

    let short_valid_until = grant(&short)["validUntil"].as_i64().unwrap();
    assert!((before + 60_000..=before + 65_000).contains(&short_valid_until));
    assert!(server.requests().is_empty());
}

#[tokio::test]
async fn refuses_to_sign_with_a_token_that_names_no_store() {
    let provider = VercelBlobStorageProvider::new(
        reqwest::Client::new(),
        VERCEL_BLOB_API_URL,
        "nounderscores",
    );

    let result = provider.get_presigned_upload_url("a.pdf", "application/pdf", None).await;

    assert_eq!(failure(result), "Vercel Blob: Invalid `token` parameter");
}

// ── get_signed_url ──────────────────────────────────────────────────

#[tokio::test]
async fn reads_the_blobs_url_from_its_metadata() {
    let server = StubServer::answering(
        200,
        json!({
            "url": "https://store.public.blob.vercel-storage.com/users/u1/my%20cv.pdf",
            "pathname": "users/u1/my cv.pdf",
            "size": 42,
        })
        .to_string(),
    )
    .await;

    let url = provider(&server).get_signed_url("users/u1/my cv+é.pdf", Some(60)).await.unwrap();

    assert_eq!(url, "https://store.public.blob.vercel-storage.com/users/u1/my%20cv.pdf");
    let request = server.single_request();
    assert_eq!(request.method, "GET");
    assert_eq!(request.path, "/api/blob");
    assert_eq!(request.query.as_deref(), Some("url=users%2Fu1%2Fmy+cv%2B%C3%A9.pdf"));
    assert!(request.body.is_empty());
    assert_common_headers(&request, "0");
}

#[tokio::test]
async fn fails_when_the_blob_does_not_exist() {
    let server =
        StubServer::start(vec![blob_error(404, "not_found", "The requested blob does not exist")])
            .await;

    let result = provider(&server).get_signed_url("users/u1/missing.pdf", None).await;

    assert_eq!(failure(result), "Vercel Blob: The requested blob does not exist");
}

#[tokio::test]
async fn fails_when_the_metadata_has_no_url() {
    let server = StubServer::answering(200, "{}").await;

    let result = provider(&server).get_signed_url("users/u1/cv.pdf", None).await;

    assert_eq!(failure(result), "Vercel Blob: the blob's metadata has no url");
}

// ── put_object ──────────────────────────────────────────────────────

#[tokio::test]
async fn puts_the_bytes_at_the_pathname_as_a_public_blob_with_its_content_type() {
    let server = StubServer::answering(
        200,
        json!({ "url": "https://store.public.blob.vercel-storage.com/exports/a 1.pdf" })
            .to_string(),
    )
    .await;

    provider(&server)
        .put_object("exports/a 1.pdf", b"%PDF-1.7 bytes", "application/pdf")
        .await
        .unwrap();

    let request = server.single_request();
    assert_eq!(request.method, "PUT");
    assert_eq!(request.path, "/api/blob/");
    assert_eq!(request.query.as_deref(), Some("pathname=exports%2Fa+1.pdf"));
    assert_eq!(request.body, b"%PDF-1.7 bytes");
    assert_eq!(request.header("x-vercel-blob-access"), Some("public"));
    assert_eq!(request.header("x-content-type"), Some("application/pdf"));
    assert_eq!(request.header("x-add-random-suffix"), None);
    assert_eq!(request.header("x-allow-overwrite"), None);
    assert_common_headers(&request, "0");
}

#[tokio::test]
async fn leaves_out_the_content_type_header_when_there_is_none() {
    let server = StubServer::answering(200, "{}").await;

    provider(&server).put_object("exports/a.bin", b"x", "").await.unwrap();

    assert_eq!(server.single_request().header("x-content-type"), None);
}

#[tokio::test]
async fn refuses_a_pathname_the_api_would_not_take_without_calling_it() {
    let server = StubServer::answering(200, "{}").await;
    let provider = provider(&server);

    for (pathname, message) in [
        ("", "Vercel Blob: pathname is required"),
        ("a//b.pdf", r#"Vercel Blob: pathname cannot contain "//", please encode it if needed"#),
        ("x".repeat(951).as_str(), "Vercel Blob: pathname is too long, maximum length is 950"),
    ] {
        let result = provider.put_object(pathname, b"x", "application/pdf").await;
        assert_eq!(failure(result), message);
    }
    provider.put_object(&"x".repeat(950), b"x", "application/pdf").await.unwrap();
    assert_eq!(server.requests().len(), 1);
}

#[tokio::test]
async fn fails_with_the_apis_reason_when_a_put_is_refused() {
    for (response, message) in [
        (
            blob_error(403, "forbidden", "nope"),
            "Vercel Blob: Access denied, please provide a valid token for this resource.",
        ),
        (blob_error(400, "bad_request", "Invalid pathname"), "Vercel Blob: Invalid pathname"),
        (blob_error(403, "store_suspended", "x"), "Vercel Blob: This store has been suspended."),
        (blob_error(404, "store_not_found", "x"), "Vercel Blob: This store does not exist."),
        (
            blob_error(412, "precondition_failed", "x"),
            "Vercel Blob: Precondition failed: ETag mismatch.",
        ),
        (
            blob_error(400, "bad_request", "the file length cannot be greater than 5GB"),
            "Vercel Blob: File is too large, the file length cannot be greater than 5GB.",
        ),
        (
            blob_error(400, "bad_request", "\"contentType\" text/html is not allowed"),
            "Vercel Blob: Content type mismatch, \"contentType\" text/html is not allowed.",
        ),
        (
            blob_error(429, "rate_limited", "slow down"),
            "Vercel Blob: Too many requests please lower the number of concurrent requests .",
        ),
        (
            blob_error(405, "not_allowed", "x"),
            "Vercel Blob: Unknown error, please visit https://vercel.com/help.",
        ),
        (
            StubResponse::new(500, "<html>Bad gateway</html>"),
            "Vercel Blob: Unknown error, please visit https://vercel.com/help.",
        ),
        (
            blob_error(503, "service_unavailable", "x"),
            "Vercel Blob: The blob service is currently not available. Please try again.",
        ),
    ] {
        let server = StubServer::start(vec![response]).await;

        let result = provider(&server).put_object("a.pdf", b"x", "application/pdf").await;

        assert_eq!(failure(result), message);
        assert_eq!(server.requests().len(), 1);
    }
}

#[tokio::test]
async fn fails_when_the_api_cannot_be_reached() {
    let provider =
        VercelBlobStorageProvider::new(reqwest::Client::new(), unreachable_base_url().await, TOKEN)
            .with_retry(BlobRetry::NONE);

    let err = provider.put_object("a.pdf", b"x", "application/pdf").await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::InternalError);
    assert!(err.source().unwrap().downcast_ref::<reqwest::Error>().is_some());
}

// ── retries ─────────────────────────────────────────────────────────

#[tokio::test]
async fn retries_a_retryable_failure_with_the_same_request_id_and_a_counted_attempt() {
    let server = StubServer::start(vec![
        StubResponse::new(502, "bad gateway"),
        blob_error(503, "service_unavailable", "x"),
        StubResponse::json(200, json!({ "url": "https://blob.example/a.pdf" })),
    ])
    .await;
    let provider =
        provider(&server).with_retry(BlobRetry { retries: 5, min_delay: Duration::from_millis(1) });

    let url = provider.get_signed_url("a.pdf", None).await.unwrap();

    assert_eq!(url, "https://blob.example/a.pdf");
    let requests = server.requests();
    assert_eq!(requests.len(), 3);
    for (attempt, request) in requests.iter().enumerate() {
        assert_common_headers(request, &attempt.to_string());
        assert_eq!(
            request.header("x-api-blob-request-id"),
            requests[0].header("x-api-blob-request-id")
        );
    }
}

#[tokio::test]
async fn gives_up_after_the_allowed_retries_with_the_last_failure() {
    let server = StubServer::start(vec![blob_error(503, "service_unavailable", "x")]).await;
    let provider =
        provider(&server).with_retry(BlobRetry { retries: 2, min_delay: Duration::from_millis(1) });

    let result = provider.get_signed_url("a.pdf", None).await;

    assert_eq!(
        failure(result),
        "Vercel Blob: The blob service is currently not available. Please try again."
    );
    assert_eq!(server.requests().len(), 3);
}

#[tokio::test]
async fn does_not_retry_a_failure_that_will_not_change() {
    let server = StubServer::start(vec![
        blob_error(404, "not_found", "x"),
        StubResponse::json(200, json!({ "url": "https://blob.example/a.pdf" })),
    ])
    .await;
    let provider =
        provider(&server).with_retry(BlobRetry { retries: 5, min_delay: Duration::from_millis(1) });

    assert!(provider.get_signed_url("a.pdf", None).await.is_err());
    assert_eq!(server.requests().len(), 1);
}

#[test]
fn retries_as_the_vercel_sdk_does_by_default_doubling_the_wait() {
    let retry = BlobRetry::default();

    assert_eq!(retry.retries, 10);
    assert_eq!(retry.delay_before_retry(1), Duration::from_secs(1));
    assert_eq!(retry.delay_before_retry(2), Duration::from_secs(2));
    assert_eq!(retry.delay_before_retry(10), Duration::from_secs(512));
}

// ── delete / delete_many ────────────────────────────────────────────

#[tokio::test]
async fn deletes_one_blob_by_posting_its_pathname() {
    let server = StubServer::answering(200, "null").await;

    provider(&server).delete("users/u1/cv.pdf").await.unwrap();

    let request = server.single_request();
    assert_eq!(request.method, "POST");
    assert_eq!(request.path, "/api/blob/delete");
    assert_eq!(request.query, None);
    assert_eq!(request.header("content-type"), Some("application/json"));
    assert_eq!(request.json(), json!({ "urls": ["users/u1/cv.pdf"] }));
    assert_common_headers(&request, "0");
}

#[tokio::test]
async fn deletes_several_blobs_in_one_request() {
    let server = StubServer::answering(200, "null").await;
    let keys = vec!["a/one.pdf".to_string(), "b/two.pdf".to_string()];

    provider(&server).delete_many(&keys).await.unwrap();

    let request = server.single_request();
    assert_eq!(request.path, "/api/blob/delete");
    assert_eq!(request.json(), json!({ "urls": ["a/one.pdf", "b/two.pdf"] }));
}

#[tokio::test]
async fn does_not_call_the_api_for_an_empty_batch() {
    let server = StubServer::answering(200, "null").await;

    provider(&server).delete_many(&[]).await.unwrap();

    assert!(server.requests().is_empty());
}

#[tokio::test]
async fn swallows_a_failed_delete() {
    let server = StubServer::start(vec![blob_error(403, "forbidden", "x")]).await;
    let provider = provider(&server);

    provider.delete("users/u1/cv.pdf").await.unwrap();
    provider.delete_many(&["a.pdf".to_string()]).await.unwrap();

    assert_eq!(server.requests().len(), 2);
}

#[tokio::test]
async fn swallows_a_delete_that_cannot_reach_the_api() {
    let provider =
        VercelBlobStorageProvider::new(reqwest::Client::new(), unreachable_base_url().await, TOKEN)
            .with_retry(BlobRetry::NONE);

    provider.delete("users/u1/cv.pdf").await.unwrap();
}

// ── without a token ─────────────────────────────────────────────────

#[tokio::test]
async fn uploads_and_reads_fail_without_a_token() {
    let server = StubServer::answering(200, "{}").await;
    let provider = unconfigured(&server);
    let message = "BLOB_PUBLIC_READ_WRITE_TOKEN is not configured";

    assert_eq!(
        failure(provider.get_presigned_upload_url("a.pdf", "application/pdf", None).await),
        message
    );
    assert_eq!(failure(provider.get_signed_url("a.pdf", None).await), message);
    assert_eq!(failure(provider.put_object("a.pdf", b"x", "application/pdf").await), message);
    assert!(server.requests().is_empty());
}

#[tokio::test]
async fn deletes_do_nothing_without_a_token() {
    let server = StubServer::answering(200, "null").await;
    let provider = unconfigured(&server);

    provider.delete("a.pdf").await.unwrap();
    provider.delete_many(&["a.pdf".to_string()]).await.unwrap();

    assert!(server.requests().is_empty());
}
