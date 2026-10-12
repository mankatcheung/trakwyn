//! The local-storage routes: `PUT /uploads/_upload/*`, the upload target
//! `LocalStorageProvider::get_presigned_upload_url` hands out, and
//! `GET /uploads/*`, which serves the URLs its `get_signed_url` hands out so
//! an uploaded document or exported PDF opens in dev and e2e.
//!
//! Both are unauthenticated: local mode is a dev convenience, and production
//! (Vercel Blob) serves its own URLs. They are mounted only when storage is
//! local disk.

use std::sync::{Arc, LazyLock};

use axum::body::Bytes;
use axum::extract::rejection::BytesRejection;
use axum::extract::{Path, State};
use axum::http::header::{CONTENT_DISPOSITION, CONTENT_TYPE, X_CONTENT_TYPE_OPTIONS};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use axum::{Json, Router};
use percent_encoding::percent_decode_str;
use regex::Regex;
use serde_json::json;
use tokio::io::AsyncReadExt;

use crate::http::constants::uploads::{
    ACCEPTED_CONTENT_TYPES, FALLBACK_CONTENT_TYPE, OBJECT, OBJECT_EMPTY_KEY, UPLOAD,
    UPLOAD_EMPTY_KEY, UPLOAD_PATH_PREFIX,
};
use crate::infrastructure::storage::LocalStorageProvider;
use crate::use_cases::ports::StorageProvider;

/// The keys `RequestUploadUrlUseCase` mints. `[^/]` matches a line break
/// too, as it does in the original's JavaScript pattern.
static UPLOAD_KEY: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"\Ausers/[^/]+/applications/[^/]+/[^/]+\z").ok());

fn invalid_storage_key() -> Response {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": "Invalid storage key" }))).into_response()
}

fn not_found() -> Response {
    (StatusCode::NOT_FOUND, Json(json!({ "error": "Not found" }))).into_response()
}

/// Fastify's answer to a body it has no parser for.
fn unsupported_media_type() -> Response {
    let body = json!({
        "statusCode": 415,
        "code": "FST_ERR_CTP_INVALID_MEDIA_TYPE",
        "error": "Unsupported Media Type",
        "message": "Unsupported Media Type",
    });
    (StatusCode::UNSUPPORTED_MEDIA_TYPE, Json(body)).into_response()
}

/// A failure that is not the client's to fix. The cause is logged, not sent.
fn internal_error(cause: &dyn std::fmt::Debug) -> Response {
    tracing::error!(error = ?cause, "[uploads] request failed");
    let body = json!({
        "statusCode": 500,
        "error": "Internal Server Error",
        "message": "Internal Server Error",
    });
    (StatusCode::INTERNAL_SERVER_ERROR, Json(body)).into_response()
}

/// JavaScript's `decodeURIComponent`: unlike a lenient percent-decoder it
/// fails on a `%` that does not start an escape, and on bytes that are not
/// UTF-8.
fn decode_uri_component(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let escape = bytes.get(index + 1..index + 3)?;
            if !escape.iter().all(u8::is_ascii_hexdigit) {
                return None;
            }
            index += 3;
        } else {
            index += 1;
        }
    }
    percent_decode_str(text).decode_utf8().ok().map(|decoded| decoded.into_owned())
}

/// The media type of a `Content-Type` value: lowercased, without parameters.
fn media_type(content_type: &str) -> String {
    content_type.split(';').next().unwrap_or_default().trim().to_ascii_lowercase()
}

fn is_upload_key(storage_key: &str) -> bool {
    UPLOAD_KEY.as_ref().is_some_and(|pattern| pattern.is_match(storage_key))
        && !storage_key.contains("..")
}

/// Stores the request body at the key in the path.
///
/// The router has already percent-decoded the wildcard and the key is
/// decoded a second time here, as the original does: the upload URL carries
/// the key through `encodeURIComponent`, and a client that encodes that URL
/// again still lands on the same key.
async fn upload(
    storage: &LocalStorageProvider,
    key: &str,
    headers: &HeaderMap,
    body: Result<Bytes, BytesRejection>,
) -> Response {
    let content_type = headers.get(CONTENT_TYPE).map(|value| value.to_str().unwrap_or_default());
    // The body is refused by its type before it is read, so a type nothing
    // parses is a 415 whatever the size.
    match content_type {
        Some(content_type) => {
            if !ACCEPTED_CONTENT_TYPES.contains(&media_type(content_type).as_str()) {
                return unsupported_media_type();
            }
        }
        None => match &body {
            Ok(body) if body.is_empty() => {
                // The original reaches its handler with no body at all and
                // fails writing it.
                return internal_error(&"upload without a body");
            }
            _ => return unsupported_media_type(),
        },
    }
    let body = match body {
        Ok(body) => body,
        Err(rejection) => return rejection.into_response(),
    };

    let Some(storage_key) = decode_uri_component(key) else {
        return internal_error(&"URI malformed");
    };
    if !is_upload_key(&storage_key) {
        return invalid_storage_key();
    }

    let mime_type = content_type
        .and_then(|content_type| content_type.split(';').next())
        .unwrap_or(FALLBACK_CONTENT_TYPE);
    match storage.put_object(&storage_key, &body, mime_type).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => internal_error(&error),
    }
}

async fn upload_at_key(
    State(storage): State<Arc<LocalStorageProvider>>,
    Path(key): Path<String>,
    headers: HeaderMap,
    body: Result<Bytes, BytesRejection>,
) -> Response {
    upload(&storage, &key, &headers, body).await
}

async fn upload_at_empty_key(
    State(storage): State<Arc<LocalStorageProvider>>,
    headers: HeaderMap,
    body: Result<Bytes, BytesRejection>,
) -> Response {
    upload(&storage, "", &headers, body).await
}

/// Serves a stored object. The key is the wildcard as the router decoded it,
/// so an encoded `%2e%2e` arrives as `..` and is caught by the same check.
async fn serve(storage: &LocalStorageProvider, storage_key: &str) -> Response {
    if storage_key.starts_with(UPLOAD_PATH_PREFIX) {
        return not_found();
    }
    if storage.resolve_key_path(storage_key).is_none() {
        return invalid_storage_key();
    }

    let mut object = match storage.open_object(storage_key).await {
        Ok(Some(object)) => object,
        Ok(None) => return not_found(),
        Err(error) => return internal_error(&error),
    };
    let mut contents = Vec::with_capacity(usize::try_from(object.size).unwrap_or_default());
    if let Err(error) = object.file.read_to_end(&mut contents).await {
        return internal_error(&error);
    }

    // `Content-Length` comes from the body.
    (
        [
            (CONTENT_TYPE, object.content_type),
            (CONTENT_DISPOSITION, "inline"),
            (X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        contents,
    )
        .into_response()
}

async fn serve_key(
    State(storage): State<Arc<LocalStorageProvider>>,
    Path(key): Path<String>,
) -> Response {
    serve(&storage, &key).await
}

async fn serve_empty_key(State(storage): State<Arc<LocalStorageProvider>>) -> Response {
    serve(&storage, "").await
}

/// A `GET` under the upload prefix: never a stored object.
async fn upload_prefix_is_not_an_object() -> Response {
    not_found()
}

/// A method the path has no route for is a 404, as in the original, where
/// routes are keyed by method.
async fn no_route() -> StatusCode {
    StatusCode::NOT_FOUND
}

/// The two routes over `storage`, for any router state.
pub fn router<S>(storage: Arc<LocalStorageProvider>) -> Router<S> {
    Router::new()
        .route(UPLOAD, put(upload_at_key).get(upload_prefix_is_not_an_object).fallback(no_route))
        .route(
            UPLOAD_EMPTY_KEY,
            put(upload_at_empty_key).get(upload_prefix_is_not_an_object).fallback(no_route),
        )
        .route(OBJECT, get(serve_key).fallback(no_route))
        .route(OBJECT_EMPTY_KEY, get(serve_empty_key).fallback(no_route))
        .with_state(storage)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_like_decode_uri_component() {
        assert_eq!(
            decode_uri_component("users%2Fu1%2Fapplications%2Fa1%2Fmy%20cv.pdf").as_deref(),
            Some("users/u1/applications/a1/my cv.pdf")
        );
        assert_eq!(decode_uri_component("plain/key.pdf").as_deref(), Some("plain/key.pdf"));
        assert_eq!(decode_uri_component("caf%C3%A9").as_deref(), Some("caf\u{00E9}"));
    }

    #[test]
    fn refuses_what_decode_uri_component_throws_on() {
        for malformed in ["100%", "%zz", "%2", "%E9"] {
            assert_eq!(decode_uri_component(malformed), None, "{malformed}");
        }
    }

    #[test]
    fn an_upload_key_has_exactly_the_minted_shape() {
        assert!(is_upload_key("users/u1/applications/a1/id-cv.pdf"));
        assert!(is_upload_key("users/u 1/applications/a\n1/id cv.pdf"));
        for refused in [
            "users/u1/applications/a1/",
            "users/u1/applications/a1/nested/cv.pdf",
            "users//applications/a1/cv.pdf",
            "documents/a1/doc.pdf",
            "/users/u1/applications/a1/cv.pdf",
            "users/../applications/a1/cv.pdf",
            "users/u1/applications/a1/cv..pdf",
            "",
        ] {
            assert!(!is_upload_key(refused), "{refused:?}");
        }
    }

    #[test]
    fn the_media_type_ignores_case_and_parameters() {
        assert_eq!(media_type("Application/PDF; charset=binary"), "application/pdf");
        assert_eq!(media_type("text/plain"), "text/plain");
        assert_eq!(media_type(""), "");
    }
}
