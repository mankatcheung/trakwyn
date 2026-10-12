//! The local-storage routes: `PUT /uploads/_upload/*` and `GET /uploads/*`.
//!
//! The container keeps local files in `<cwd>/uploads` (gitignored), as
//! `apps/api` does, so every test works under ids of its own and removes
//! what it wrote when its [`Scratch`] is dropped.

use std::path::PathBuf;

use axum::body::Body;
use axum::http::header::{
    CONTENT_DISPOSITION, CONTENT_LENGTH, CONTENT_TYPE, X_CONTENT_TYPE_OPTIONS,
};
use axum::http::{HeaderMap, Method, Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

use trakwyn_api::config::storage::StorageProviderKind;
use trakwyn_api::config::Config;
use trakwyn_api::infrastructure::storage::LocalStorageProvider;

use crate::common::{test_config, TestApp};

const PDF_BYTES: &[u8] = b"%PDF-1.4 fake pdf body";

/// Ids no other test uses, and the removal of everything stored under them.
pub struct Scratch {
    pub user_id: String,
    pub application_id: String,
}

impl Scratch {
    pub fn new() -> Self {
        let unique = nanoid::nanoid!(12, &nanoid::alphabet::SAFE[2..]);
        Self {
            user_id: format!("test-user-{unique}"),
            application_id: format!("test-app-{unique}"),
        }
    }

    fn upload_dir() -> PathBuf {
        LocalStorageProvider::default_upload_dir().unwrap()
    }

    /// A key of the shape `requestUploadUrl` mints.
    pub fn upload_key(&self, file_name: &str) -> String {
        format!("users/{}/applications/{}/{file_name}", self.user_id, self.application_id)
    }

    /// A key of the shape `exportDocumentDraftToPdf` stores under.
    pub fn export_key(&self, file_name: &str) -> String {
        format!("documents/{}/{file_name}", self.application_id)
    }

    /// Whether a file is stored at `key`.
    pub fn holds(&self, key: &str) -> bool {
        Self::upload_dir().join(key).is_file()
    }

    pub fn read(&self, key: &str) -> Vec<u8> {
        std::fs::read(Self::upload_dir().join(key)).unwrap()
    }

    /// Stores a file directly, as an export does.
    pub fn write(&self, key: &str, contents: &[u8]) {
        let path = Self::upload_dir().join(key);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, contents).unwrap();
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let root = Self::upload_dir();
        // Ignored on purpose: a test that stored nothing has nothing to remove.
        let _ = std::fs::remove_dir_all(root.join("users").join(&self.user_id));
        let _ = std::fs::remove_dir_all(root.join("documents").join(&self.application_id));
    }
}

/// A response with its body as the bytes that were sent.
pub struct RawResponse {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Vec<u8>,
}

impl RawResponse {
    pub fn json(&self) -> Value {
        serde_json::from_slice(&self.body)
            .unwrap_or_else(|_| panic!("not JSON: {}", String::from_utf8_lossy(&self.body)))
    }
}

pub async fn send_raw(app: &TestApp, request: Request<Body>) -> RawResponse {
    let response = app.router.clone().oneshot(request).await.unwrap();
    let (parts, body) = response.into_parts();
    let body = body.collect().await.unwrap().to_bytes().to_vec();
    RawResponse { status: parts.status, headers: parts.headers, body }
}

/// JavaScript's `encodeURIComponent`, near enough for the keys used here.
pub fn encode_key(key: &str) -> String {
    key.replace('%', "%25").replace('/', "%2F").replace(' ', "%20")
}

pub async fn put(app: &TestApp, uri: &str, content_type: Option<&str>, body: &[u8]) -> RawResponse {
    let builder = Request::builder().method(Method::PUT).uri(uri);
    let builder = match content_type {
        Some(content_type) => builder.header(CONTENT_TYPE, content_type),
        None => builder,
    };
    send_raw(app, builder.body(Body::from(body.to_vec())).unwrap()).await
}

pub async fn get(app: &TestApp, uri: &str) -> RawResponse {
    send_raw(app, Request::get(uri).body(Body::empty()).unwrap()).await
}

fn upload_uri(key: &str) -> String {
    format!("/uploads/_upload/{}", encode_key(key))
}

#[tokio::test]
async fn serves_a_file_uploaded_through_the_upload_route() {
    let app = TestApp::start().await;
    let scratch = Scratch::new();
    let key = scratch.upload_key("resume.pdf");

    let uploaded = put(&app, &upload_uri(&key), Some("application/pdf"), PDF_BYTES).await;
    assert_eq!(uploaded.status, 204);
    assert!(uploaded.body.is_empty());
    assert_eq!(scratch.read(&key), PDF_BYTES);

    let served = get(&app, &format!("/uploads/{key}")).await;

    assert_eq!(served.status, 200);
    assert_eq!(served.headers[CONTENT_TYPE], "application/pdf");
    assert_eq!(served.headers[CONTENT_LENGTH], PDF_BYTES.len().to_string().as_str());
    assert_eq!(served.headers[CONTENT_DISPOSITION], "inline");
    assert_eq!(served.headers[X_CONTENT_TYPE_OPTIONS], "nosniff");
    assert_eq!(served.body, PDF_BYTES);
}

#[tokio::test]
async fn serves_an_exported_pdf_whose_key_lives_outside_users() {
    let app = TestApp::start().await;
    let scratch = Scratch::new();
    let key = scratch.export_key("doc-1.pdf");
    scratch.write(&key, PDF_BYTES);

    let served = get(&app, &format!("/uploads/{key}")).await;

    assert_eq!(served.status, 200);
    assert_eq!(served.headers[CONTENT_TYPE], "application/pdf");
    assert_eq!(served.body, PDF_BYTES);
}

#[tokio::test]
async fn the_content_type_served_comes_from_the_extension_not_the_upload() {
    let app = TestApp::start().await;
    let scratch = Scratch::new();
    let text_key = scratch.upload_key("notes.txt");
    let unknown_key = scratch.upload_key("archive.bin");

    // Uploaded as a PDF; served by what the name says.
    assert_eq!(put(&app, &upload_uri(&text_key), Some("application/pdf"), b"hi").await.status, 204);
    let binary =
        put(&app, &upload_uri(&unknown_key), Some("application/octet-stream"), b"\0\x01").await;
    assert_eq!(binary.status, 204);

    let text = get(&app, &format!("/uploads/{text_key}")).await;
    assert_eq!(text.headers[CONTENT_TYPE], "text/plain; charset=utf-8");
    assert_eq!(text.body, b"hi");
    let unknown = get(&app, &format!("/uploads/{unknown_key}")).await;
    assert_eq!(unknown.headers[CONTENT_TYPE], "application/octet-stream");
    assert_eq!(unknown.headers[X_CONTENT_TYPE_OPTIONS], "nosniff");
    assert_eq!(unknown.body, b"\0\x01");
}

#[tokio::test]
async fn accepts_the_three_body_types_with_or_without_parameters() {
    let app = TestApp::start().await;
    let scratch = Scratch::new();

    for (index, content_type) in [
        "application/pdf",
        "application/octet-stream",
        "text/plain",
        "text/plain; charset=utf-8",
        "Application/PDF",
    ]
    .into_iter()
    .enumerate()
    {
        let key = scratch.upload_key(&format!("file-{index}.pdf"));
        let response = put(&app, &upload_uri(&key), Some(content_type), b"body").await;
        assert_eq!(response.status, 204, "{content_type}");
        assert!(scratch.holds(&key), "{content_type}");
    }
}

#[tokio::test]
async fn a_body_type_the_route_does_not_read_is_a_415() {
    let app = TestApp::start().await;
    let scratch = Scratch::new();
    let key = scratch.upload_key("photo.png");

    for content_type in [
        Some("image/png"),
        Some("image/jpeg"),
        Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        Some("application/msword"),
        None,
    ] {
        let response = put(&app, &upload_uri(&key), content_type, b"bytes").await;

        assert_eq!(response.status, 415, "{content_type:?}");
        assert_eq!(
            response.json(),
            json!({
                "statusCode": 415,
                "code": "FST_ERR_CTP_INVALID_MEDIA_TYPE",
                "error": "Unsupported Media Type",
                "message": "Unsupported Media Type",
            })
        );
    }
    assert!(!scratch.holds(&key));
}

#[tokio::test]
async fn an_upload_replaces_what_was_stored_at_the_key() {
    let app = TestApp::start().await;
    let scratch = Scratch::new();
    let key = scratch.upload_key("resume.pdf");

    put(&app, &upload_uri(&key), Some("application/pdf"), b"first").await;
    put(&app, &upload_uri(&key), Some("application/pdf"), b"second").await;

    assert_eq!(scratch.read(&key), b"second");
}

#[tokio::test]
async fn a_key_that_was_encoded_twice_lands_on_the_same_key() {
    let app = TestApp::start().await;
    let scratch = Scratch::new();
    let key = scratch.upload_key("my resume.pdf");
    let twice = encode_key(&encode_key(&key));

    let response =
        put(&app, &format!("/uploads/_upload/{twice}"), Some("application/pdf"), PDF_BYTES).await;

    assert_eq!(response.status, 204);
    assert_eq!(scratch.read(&key), PDF_BYTES);
}

#[tokio::test]
async fn refuses_an_upload_key_that_is_not_of_the_minted_shape() {
    let app = TestApp::start().await;
    let scratch = Scratch::new();
    let user = &scratch.user_id;

    for (label, key) in [
        ("an export key", scratch.export_key("doc-1.pdf")),
        ("a nested file", format!("users/{user}/applications/a1/nested/cv.pdf")),
        ("no file name", format!("users/{user}/applications/a1")),
        ("a parent segment", format!("users/{user}/applications/../cv.pdf")),
        ("a traversal out of the upload dir", "users/../applications/../../Cargo.toml".to_string()),
        ("dots inside a name", format!("users/{user}/applications/a1/cv..pdf")),
        ("an absolute path", "/etc/passwd".to_string()),
        ("some other top-level directory", "avatars/u1/applications/a1/cv.pdf".to_string()),
    ] {
        let response = put(&app, &upload_uri(&key), Some("application/pdf"), PDF_BYTES).await;

        assert_eq!(response.status, 400, "{label}");
        assert_eq!(response.json(), json!({ "error": "Invalid storage key" }), "{label}");
    }
    assert!(!scratch.holds(&scratch.export_key("doc-1.pdf")));
}

#[tokio::test]
async fn refuses_an_upload_with_an_empty_key() {
    let app = TestApp::start().await;

    let response = put(&app, "/uploads/_upload/", Some("application/pdf"), PDF_BYTES).await;

    assert_eq!(response.status, 400);
    assert_eq!(response.json(), json!({ "error": "Invalid storage key" }));
}

#[tokio::test]
async fn an_upload_key_that_does_not_decode_is_a_server_error() {
    let app = TestApp::start().await;

    // `%25zz` reaches the handler as `%zz`, which `decodeURIComponent` rejects.
    let response =
        put(&app, "/uploads/_upload/users%25zz", Some("application/pdf"), PDF_BYTES).await;

    assert_eq!(response.status, 500);
}

#[tokio::test]
async fn an_upload_over_the_body_limit_is_refused() {
    let app = TestApp::start().await;
    let scratch = Scratch::new();
    let key = scratch.upload_key("big.pdf");
    let body = vec![b'x'; 1024 * 1024 + 1];

    let response = put(&app, &upload_uri(&key), Some("application/pdf"), &body).await;

    assert_eq!(response.status, 413);
    assert!(!scratch.holds(&key));
}

#[tokio::test]
async fn returns_404_for_a_key_with_no_file() {
    let app = TestApp::start().await;
    let scratch = Scratch::new();

    let response = get(&app, &format!("/uploads/{}", scratch.upload_key("missing.pdf"))).await;

    assert_eq!(response.status, 404);
    assert_eq!(response.json(), json!({ "error": "Not found" }));
}

#[tokio::test]
async fn returns_404_for_a_key_that_names_a_directory() {
    let app = TestApp::start().await;
    let scratch = Scratch::new();
    scratch.write(&scratch.upload_key("resume.pdf"), PDF_BYTES);

    let response = get(&app, &format!("/uploads/users/{}", scratch.user_id)).await;

    assert_eq!(response.status, 404);
    assert_eq!(response.json(), json!({ "error": "Not found" }));
}

#[tokio::test]
async fn does_not_serve_the_upload_route_prefix_as_a_stored_object() {
    let app = TestApp::start().await;
    let scratch = Scratch::new();
    let key = scratch.upload_key("resume.pdf");
    scratch.write(&key, PDF_BYTES);

    for uri in [upload_uri(&key), format!("/uploads/_upload/{key}"), "/uploads/_upload/".into()] {
        let response = get(&app, &uri).await;

        assert_eq!(response.status, 404, "{uri}");
        assert_eq!(response.json(), json!({ "error": "Not found" }), "{uri}");
    }
}

#[tokio::test]
async fn rejects_a_traversal_attempt_with_400() {
    let app = TestApp::start().await;

    for (label, uri) in [
        ("an encoded slash", "/uploads/users%2f..%2f..%2fCargo.toml"),
        ("a backslash", "/uploads/users%5c..%5c..%5cCargo.toml"),
        ("encoded dot segments", "/uploads/%2e%2e/Cargo.toml"),
        ("a nested parent segment", "/uploads/users/u1/../../../Cargo.toml"),
        ("an absolute path", "/uploads//etc/passwd"),
        ("a NUL byte", "/uploads/users/u1/file.pdf%00.txt"),
        ("an empty key", "/uploads/"),
    ] {
        let response = get(&app, uri).await;

        assert_eq!(response.status, 400, "{label}");
        assert_eq!(response.json(), json!({ "error": "Invalid storage key" }), "{label}");
    }
}

#[tokio::test]
async fn never_serves_a_file_outside_the_upload_dir() {
    let app = TestApp::start().await;

    // `Cargo.toml` sits next to the upload dir, so each of these would reach
    // it if the key were joined unchecked.
    for uri in [
        "/uploads/../Cargo.toml",
        "/uploads/%2e%2e/Cargo.toml",
        "/uploads/..%2fCargo.toml",
        "/uploads/users/..%2f..%2fCargo.toml",
    ] {
        let response = get(&app, uri).await;

        assert_ne!(response.status, 200, "{uri}");
        assert!(!String::from_utf8_lossy(&response.body).contains("[package]"), "{uri}");
    }
}

#[tokio::test]
async fn a_head_request_gets_the_headers_without_the_body() {
    let app = TestApp::start().await;
    let scratch = Scratch::new();
    let key = scratch.export_key("doc-1.pdf");
    scratch.write(&key, PDF_BYTES);

    let request = Request::head(format!("/uploads/{key}")).body(Body::empty()).unwrap();
    let response = send_raw(&app, request).await;

    assert_eq!(response.status, 200);
    assert_eq!(response.headers[CONTENT_TYPE], "application/pdf");
    assert_eq!(response.headers[CONTENT_LENGTH], PDF_BYTES.len().to_string().as_str());
    assert!(response.body.is_empty());
}

#[tokio::test]
async fn other_methods_have_no_route() {
    let app = TestApp::start().await;
    let scratch = Scratch::new();
    let key = scratch.upload_key("resume.pdf");
    scratch.write(&key, PDF_BYTES);

    for (method, uri) in [
        (Method::PUT, format!("/uploads/{key}")),
        (Method::DELETE, format!("/uploads/{key}")),
        (Method::POST, upload_uri(&key)),
        (Method::DELETE, upload_uri(&key)),
    ] {
        let request = Request::builder()
            .method(method.clone())
            .uri(&uri)
            .header(CONTENT_TYPE, "application/pdf")
            .body(Body::from("x"))
            .unwrap();

        assert_eq!(send_raw(&app, request).await.status, 404, "{method} {uri}");
    }
    assert_eq!(scratch.read(&key), PDF_BYTES);
}

#[tokio::test]
async fn the_routes_are_absent_when_storage_is_not_local() {
    let mut config: Config = test_config();
    config.storage.provider = StorageProviderKind::VercelBlob;
    let app = TestApp::start_with(config).await;
    let scratch = Scratch::new();
    let key = scratch.export_key("doc-1.pdf");
    scratch.write(&key, PDF_BYTES);

    let served = get(&app, &format!("/uploads/{key}")).await;
    assert_eq!(served.status, 404);
    assert!(served.body.is_empty());

    let upload_key = scratch.upload_key("resume.pdf");
    let uploaded = put(&app, &upload_uri(&upload_key), Some("application/pdf"), PDF_BYTES).await;
    assert_eq!(uploaded.status, 404);
    assert!(!scratch.holds(&upload_key));
}
