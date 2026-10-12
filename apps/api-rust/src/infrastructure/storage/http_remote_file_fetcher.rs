use std::time::Duration;

use async_trait::async_trait;
use reqwest::header::CONTENT_LENGTH;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::remote_file_fetcher::{RemoteFile, RemoteFileFetcher};

/// Reads a stored file back over HTTP from the URL the storage provider
/// signed. The URL is one this server generated, never one a user typed, so
/// no outbound URL policy applies here.
#[derive(Debug, Clone, Default)]
pub struct HttpRemoteFileFetcher {
    client: reqwest::Client,
}

impl HttpRemoteFileFetcher {
    pub fn new(client: reqwest::Client) -> Self {
        Self { client }
    }

    async fn read(&self, url: &str, max_bytes: usize) -> DomainResult<RemoteFile> {
        let mut response = self.client.get(url).send().await.map_err(DomainError::internal)?;
        if !response.status().is_success() {
            return Ok(RemoteFile::NotOk);
        }
        let declared = response
            .headers()
            .get(CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.trim().parse::<u64>().ok())
            .unwrap_or(0);
        if declared > max_bytes as u64 {
            return Ok(RemoteFile::TooLarge);
        }

        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(DomainError::internal)? {
            body.extend_from_slice(&chunk);
            if body.len() > max_bytes {
                return Ok(RemoteFile::TooLarge);
            }
        }
        Ok(RemoteFile::Body(body))
    }
}

#[async_trait]
impl RemoteFileFetcher for HttpRemoteFileFetcher {
    async fn fetch(
        &self,
        url: &str,
        timeout: Duration,
        max_bytes: usize,
    ) -> DomainResult<RemoteFile> {
        match tokio::time::timeout(timeout, self.read(url, max_bytes)).await {
            Ok(result) => result,
            Err(_) => Err(DomainError::internal("timed out reading the stored file")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::llm::stub_server::{StubReply, StubServer};
    use crate::use_cases::errors::ErrorCode;

    const LIMIT: usize = 16;
    const TIMEOUT: Duration = Duration::from_secs(5);

    async fn fetch(reply: StubReply, timeout: Duration) -> DomainResult<RemoteFile> {
        let server = StubServer::start(vec![reply]).await;
        HttpRemoteFileFetcher::default().fetch(&server.url("/file"), timeout, LIMIT).await
    }

    #[tokio::test]
    async fn returns_the_body_of_a_successful_response() {
        let file = fetch(StubReply::text(200, "resume bytes"), TIMEOUT).await.unwrap();

        assert_eq!(file, RemoteFile::Body(b"resume bytes".to_vec()));
    }

    #[tokio::test]
    async fn a_body_exactly_at_the_cap_is_accepted() {
        let file = fetch(StubReply::text(200, "x".repeat(LIMIT)), TIMEOUT).await.unwrap();

        assert_eq!(file, RemoteFile::Body(vec![b'x'; LIMIT]));
    }

    #[tokio::test]
    async fn reports_a_non_2xx_status_as_not_ok() {
        for status in [403, 404, 500] {
            assert_eq!(
                fetch(StubReply::text(status, "nope"), TIMEOUT).await.unwrap(),
                RemoteFile::NotOk
            );
        }
    }

    #[tokio::test]
    async fn refuses_a_body_larger_than_the_cap() {
        let file = fetch(StubReply::text(200, "x".repeat(LIMIT + 1)), TIMEOUT).await.unwrap();

        assert_eq!(file, RemoteFile::TooLarge);
    }

    #[tokio::test]
    async fn refuses_a_streamed_body_that_outgrows_the_cap_without_a_declared_length() {
        let file = fetch(StubReply::sse(&["0123456789", "0123456789"]), TIMEOUT).await.unwrap();

        assert_eq!(file, RemoteFile::TooLarge);
    }

    #[tokio::test]
    async fn a_server_that_never_answers_is_an_internal_error_once_the_timeout_passes() {
        let err = fetch(StubReply::Hang, Duration::from_millis(50)).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::InternalError);
    }

    #[tokio::test]
    async fn an_unreachable_server_is_an_internal_error() {
        let err = HttpRemoteFileFetcher::default()
            .fetch("http://127.0.0.1:1/file", TIMEOUT, LIMIT)
            .await
            .unwrap_err();

        assert_eq!(err.code(), ErrorCode::InternalError);
    }
}
