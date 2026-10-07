use async_trait::async_trait;

use crate::use_cases::errors::DomainResult;

/// Where uploaded documents and exported PDFs live.
///
/// `ttl_seconds` is `None` where `apps/api` omits the argument; each
/// implementation applies its own default.
#[async_trait]
pub trait StorageProvider: Send + Sync {
    /// What the client needs to upload `key` directly: a URL to `PUT` to, or
    /// (Vercel Blob) an opaque client token in its place.
    async fn get_presigned_upload_url(
        &self,
        key: &str,
        mime_type: &str,
        ttl_seconds: Option<u64>,
    ) -> DomainResult<String>;

    async fn get_signed_url(&self, key: &str, ttl_seconds: Option<u64>) -> DomainResult<String>;

    async fn put_object(&self, key: &str, data: &[u8], mime_type: &str) -> DomainResult<()>;

    /// Best-effort: a key that is already gone is not an error.
    async fn delete(&self, key: &str) -> DomainResult<()>;

    /// Remove several objects in as few round trips as the backend allows.
    /// Emptying Trash runs this once per application from inside a
    /// serverless request, where a call per blob adds up quickly.
    /// Best-effort like `delete`: a key that is already gone is not an error.
    async fn delete_many(&self, keys: &[String]) -> DomainResult<()>;
}
