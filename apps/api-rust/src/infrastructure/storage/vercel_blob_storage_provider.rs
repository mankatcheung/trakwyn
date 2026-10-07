use std::fmt;
use std::time::Duration;

use async_trait::async_trait;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use hmac::{Hmac, Mac};
use reqwest::Method;
use serde::Serialize;
use sha2::Sha256;

use crate::use_cases::clock;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::StorageProvider;

/// Vercel Blob's control-plane API: what production passes as `api_url`.
pub const VERCEL_BLOB_API_URL: &str = "https://vercel.com/api/blob";

/// The API version `@vercel/blob` 2.8.0 speaks, sent as `x-api-version`.
const API_VERSION: &str = "12";
const TOKEN_ENV_NAME: &str = "BLOB_PUBLIC_READ_WRITE_TOKEN";
const DEFAULT_UPLOAD_TTL_SECONDS: u64 = 300;
/// Longest pathname the API accepts, in UTF-16 code units.
const MAX_PATHNAME_LENGTH: usize = 950;
const REQUEST_ID_SUFFIX_LENGTH: usize = 13;
const HEX_DIGITS: [char; 16] =
    ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];

/// Error codes the API may recover from on its own, so the request is retried.
const RETRYABLE_CODES: [&str; 3] =
    ["unknown_error", "service_unavailable", "internal_server_error"];

/// A failure reported by Vercel Blob or by this client's own checks, worded
/// as `@vercel/blob` words it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VercelBlobError(String);

impl VercelBlobError {
    fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl fmt::Display for VercelBlobError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Vercel Blob: {}", self.0)
    }
}

impl std::error::Error for VercelBlobError {}

type BoxError = Box<dyn std::error::Error + Send + Sync>;

/// How a request that failed with a retryable error is tried again.
///
/// The default is `@vercel/blob`'s: up to ten more attempts, the first after
/// a second and each wait double the last. That is a worst case of about
/// seventeen minutes, and it applies to the best-effort deletes too.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BlobRetry {
    pub retries: u32,
    pub min_delay: Duration,
}

impl Default for BlobRetry {
    fn default() -> Self {
        Self { retries: 10, min_delay: Duration::from_millis(1_000) }
    }
}

impl BlobRetry {
    /// One attempt and no more.
    pub const NONE: Self = Self { retries: 0, min_delay: Duration::ZERO };

    fn delay_before_retry(self, retry: u32) -> Duration {
        self.min_delay.saturating_mul(2u32.saturating_pow(retry.saturating_sub(1)))
    }
}

/// What a client token allows its holder to upload.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClientTokenPayload<'a> {
    pathname: &'a str,
    allowed_content_types: [&'a str; 1],
    add_random_suffix: bool,
    /// Milliseconds since the epoch.
    valid_until: i64,
}

#[derive(Serialize)]
struct DeleteBody<'a> {
    urls: &'a [String],
}

struct ApiRequest<'a> {
    method: Method,
    /// Appended to the API URL as it stands: a path, a query, or both.
    path: String,
    headers: Vec<(&'static str, String)>,
    body: Option<&'a [u8]>,
}

/// Vercel Blob has no raw presigned-PUT URL like S3/GCS: the client must
/// upload using `put()` from `@vercel/blob/client` with a short-lived client
/// token. `get_presigned_upload_url` returns that token (as an opaque string,
/// in place of a URL) so the `StorageProvider` contract and the upload
/// authorization logic don't need to change; the web app passes it straight
/// through to `put()`. This means uploads go directly from the browser to
/// Blob storage, never through our API, which matters because serverless
/// functions have request body size limits well under the 10MB document cap
/// this app allows.
///
/// Speaks the same REST API `@vercel/blob` does, with a read-write token.
pub struct VercelBlobStorageProvider {
    client: reqwest::Client,
    api_url: String,
    token: String,
    retry: BlobRetry,
}

impl VercelBlobStorageProvider {
    /// `api_url` is [`VERCEL_BLOB_API_URL`] outside tests. `token` is the
    /// public store's read-write token; with an empty one, uploads and reads
    /// fail and deletes do nothing.
    pub fn new(
        client: reqwest::Client,
        api_url: impl Into<String>,
        token: impl Into<String>,
    ) -> Self {
        Self { client, api_url: api_url.into(), token: token.into(), retry: BlobRetry::default() }
    }

    pub fn with_retry(mut self, retry: BlobRetry) -> Self {
        self.retry = retry;
        self
    }

    fn assert_configured(&self) -> DomainResult<()> {
        if self.token.is_empty() {
            return Err(DomainError::internal(format!("{TOKEN_ENV_NAME} is not configured")));
        }
        Ok(())
    }

    /// The store a read-write token belongs to: its fourth `_`-separated
    /// part (`vercel_blob_rw_<store id>_<secret>`), or empty.
    fn store_id(&self) -> &str {
        self.token.split('_').nth(3).unwrap_or("")
    }

    /// `vercel_blob_client_<store id>_<base64(signature.payload)>`, where the
    /// payload is the base64 of the JSON grant and the signature is the hex
    /// HMAC-SHA256 of that base64 text, keyed with the read-write token.
    fn client_token(
        &self,
        pathname: &str,
        mime_type: &str,
        valid_until_ms: i64,
    ) -> Result<String, BoxError> {
        let store_id = self.store_id();
        if store_id.is_empty() {
            return Err(VercelBlobError::new("Invalid `token` parameter").into());
        }

        let payload = BASE64.encode(serde_json::to_string(&ClientTokenPayload {
            pathname,
            allowed_content_types: [mime_type],
            add_random_suffix: false,
            valid_until: valid_until_ms,
        })?);
        let mut mac = Hmac::<Sha256>::new_from_slice(self.token.as_bytes())
            .map_err(|_| VercelBlobError::new("Unable to sign client token"))?;
        mac.update(payload.as_bytes());
        let signature = hex::encode(mac.finalize().into_bytes());

        Ok(format!(
            "vercel_blob_client_{store_id}_{}",
            BASE64.encode(format!("{signature}.{payload}"))
        ))
    }

    fn request_id(&self) -> String {
        format!(
            "{}:{}:{}",
            self.store_id(),
            clock::now().timestamp_millis(),
            nanoid::nanoid!(REQUEST_ID_SUFFIX_LENGTH, &HEX_DIGITS)
        )
    }

    /// Sends one API request, retrying it per the retry policy when the
    /// connection fails or the API answers with a retryable error, and
    /// returns the JSON it answered with.
    async fn request(&self, request: ApiRequest<'_>) -> Result<serde_json::Value, BoxError> {
        let url = format!("{}{}", self.api_url, request.path);
        let request_id = self.request_id();
        let mut attempt: u32 = 0;

        loop {
            let mut builder = self
                .client
                .request(request.method.clone(), &url)
                .header("x-api-blob-request-id", &request_id)
                // The store id travels as a header as well as inside the token.
                .header("x-vercel-blob-store-id", self.store_id())
                .header("x-api-blob-request-attempt", attempt.to_string())
                .header("x-api-version", API_VERSION)
                .header("authorization", format!("Bearer {}", self.token));
            for (name, value) in &request.headers {
                builder = builder.header(*name, value);
            }
            if let Some(body) = request.body {
                builder = builder.body(body.to_vec());
            }

            let error: BoxError = match builder.send().await {
                Ok(response) if response.status().is_success() => {
                    return Ok(response.json().await?);
                }
                Ok(response) => {
                    let (code, error) = read_blob_error(response).await;
                    if !RETRYABLE_CODES.contains(&code.as_str()) {
                        return Err(error.into());
                    }
                    error.into()
                }
                // The request never got an answer.
                Err(error) => error.into(),
            };

            if attempt >= self.retry.retries {
                return Err(error);
            }
            attempt += 1;
            tokio::time::sleep(self.retry.delay_before_retry(attempt)).await;
        }
    }

    async fn delete_urls(&self, urls: &[String]) -> Result<(), BoxError> {
        self.request(ApiRequest {
            method: Method::POST,
            path: "/delete".to_string(),
            headers: vec![("content-type", "application/json".to_string())],
            body: Some(&serde_json::to_vec(&DeleteBody { urls })?),
        })
        .await?;
        Ok(())
    }
}

/// `name=value` as `URLSearchParams` writes it.
fn query(name: &str, value: &str) -> String {
    url::form_urlencoded::Serializer::new(String::new()).append_pair(name, value).finish()
}

fn validate_pathname(pathname: &str) -> Result<(), VercelBlobError> {
    if pathname.is_empty() {
        return Err(VercelBlobError::new("pathname is required"));
    }
    if pathname.encode_utf16().count() > MAX_PATHNAME_LENGTH {
        return Err(VercelBlobError::new(format!(
            "pathname is too long, maximum length is {MAX_PATHNAME_LENGTH}"
        )));
    }
    if pathname.contains("//") {
        return Err(VercelBlobError::new(
            r#"pathname cannot contain "//", please encode it if needed"#,
        ));
    }
    Ok(())
}

/// Reads the API's `{ "error": { "code", "message" } }` body into the code
/// that decides whether to retry and the error `@vercel/blob` would throw.
async fn read_blob_error(response: reqwest::Response) -> (String, VercelBlobError) {
    let retry_after = response
        .headers()
        .get("retry-after")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u64>().ok());
    let body: Option<serde_json::Value> = response.json().await.ok();
    let error = body.as_ref().and_then(|body| body.get("error"));
    let message = error.and_then(|error| error.get("message")).and_then(|m| m.as_str());
    let reported = match &body {
        None => "unknown_error",
        Some(_) => error
            .and_then(|error| error.get("code"))
            .and_then(|code| code.as_str())
            .unwrap_or("unknown_error"),
    };

    // Some failures are only recognisable by their message.
    let code = match message {
        Some(m) if m.contains("the file length cannot be greater than") => "file_too_large",
        Some("Token expired") => "client_token_expired",
        Some(m) if m.contains("\"pathname\"") && m.contains("does not match the token payload") => {
            "client_token_pathname_mismatch"
        }
        Some(m) if m.contains("contentType") && m.contains("is not allowed") => {
            "content_type_not_allowed"
        }
        _ => reported,
    };

    let text = match code {
        "store_suspended" => "This store has been suspended.".to_string(),
        "forbidden" => "Access denied, please provide a valid token for this resource.".to_string(),
        "content_type_not_allowed" => {
            format!("Content type mismatch, {}.", message.unwrap_or_default())
        }
        "client_token_pathname_mismatch" => format!(
            "Pathname mismatch, {}. Check the pathname used in upload() or put() matches the one from the client token.",
            message.unwrap_or_default()
        ),
        "client_token_expired" => "Client token has expired.".to_string(),
        "file_too_large" => format!("File is too large, {}.", message.unwrap_or_default()),
        "not_found" => "The requested blob does not exist".to_string(),
        "client_token_not_allowed" => message
            .unwrap_or(
                "This operation is not available when using a client token. Use a read–write or OIDC token on the server.",
            )
            .to_string(),
        "store_not_found" => "This store does not exist.".to_string(),
        "bad_request" => message.unwrap_or("Bad request").to_string(),
        "service_unavailable" => {
            "The blob service is currently not available. Please try again.".to_string()
        }
        "rate_limited" => format!(
            "Too many requests please lower the number of concurrent requests {}.",
            match retry_after {
                Some(seconds) if seconds > 0 => format!(" - try again in {seconds} seconds"),
                _ => String::new(),
            }
        ),
        "precondition_failed" => "Precondition failed: ETag mismatch.".to_string(),
        _ => "Unknown error, please visit https://vercel.com/help.".to_string(),
    };
    (code.to_string(), VercelBlobError::new(text))
}

#[async_trait]
impl StorageProvider for VercelBlobStorageProvider {
    async fn get_presigned_upload_url(
        &self,
        key: &str,
        mime_type: &str,
        ttl_seconds: Option<u64>,
    ) -> DomainResult<String> {
        self.assert_configured()?;
        let ttl_ms = ttl_seconds.unwrap_or(DEFAULT_UPLOAD_TTL_SECONDS).saturating_mul(1_000);
        let valid_until_ms = clock::now()
            .timestamp_millis()
            .saturating_add(i64::try_from(ttl_ms).unwrap_or(i64::MAX));
        self.client_token(key, mime_type, valid_until_ms).map_err(DomainError::internal)
    }

    async fn get_signed_url(&self, key: &str, _ttl_seconds: Option<u64>) -> DomainResult<String> {
        self.assert_configured()?;
        // The API has no HEAD: metadata is a GET on the store with the
        // pathname (or URL) as the `url` parameter.
        let blob = self
            .request(ApiRequest {
                method: Method::GET,
                path: format!("?{}", query("url", key)),
                headers: Vec::new(),
                body: None,
            })
            .await
            .map_err(DomainError::internal)?;
        match blob.get("url").and_then(|url| url.as_str()) {
            Some(url) => Ok(url.to_string()),
            None => {
                Err(DomainError::internal(VercelBlobError::new("the blob's metadata has no url")))
            }
        }
    }

    async fn put_object(&self, key: &str, data: &[u8], mime_type: &str) -> DomainResult<()> {
        self.assert_configured()?;
        validate_pathname(key).map_err(DomainError::internal)?;

        let mut headers = vec![("x-vercel-blob-access", "public".to_string())];
        if !mime_type.is_empty() {
            headers.push(("x-content-type", mime_type.to_string()));
        }
        self.request(ApiRequest {
            method: Method::PUT,
            path: format!("/?{}", query("pathname", key)),
            headers,
            body: Some(data),
        })
        .await
        .map_err(DomainError::internal)?;
        Ok(())
    }

    async fn delete(&self, key: &str) -> DomainResult<()> {
        if self.token.is_empty() {
            return Ok(());
        }
        // Best-effort cleanup: matches `LocalStorageProvider`.
        let _ = self.delete_urls(&[key.to_string()]).await;
        Ok(())
    }

    async fn delete_many(&self, keys: &[String]) -> DomainResult<()> {
        if self.token.is_empty() || keys.is_empty() {
            return Ok(());
        }
        // One request removes the lot, which is the whole reason this method
        // exists rather than looping over `delete`. Best-effort like it.
        let _ = self.delete_urls(keys).await;
        Ok(())
    }
}

#[cfg(test)]
mod tests;
