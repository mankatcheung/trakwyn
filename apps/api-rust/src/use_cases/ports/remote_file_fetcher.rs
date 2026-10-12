use std::time::Duration;

use async_trait::async_trait;

use crate::use_cases::errors::DomainResult;

/// What came back from reading a stored file over HTTP.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RemoteFile {
    /// The server answered with a non-2xx status.
    NotOk,
    /// The declared `Content-Length`, or the body itself, exceeds the cap.
    TooLarge,
    Body(Vec<u8>),
}

/// Reads a file back from a URL the storage provider signed, so it can be
/// parsed on the request path. `apps/api` calls `fetch` for this inside the
/// use case; a use case here names no HTTP client, so it is a port.
///
/// `timeout` bounds the whole exchange, body included. A network failure or
/// the timeout is an internal error. An implementation checks the declared
/// length before reading the body and stops reading once `max_bytes` is
/// passed.
#[async_trait]
pub trait RemoteFileFetcher: Send + Sync {
    async fn fetch(
        &self,
        url: &str,
        timeout: Duration,
        max_bytes: usize,
    ) -> DomainResult<RemoteFile>;
}
