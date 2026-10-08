use std::sync::Arc;

use futures::FutureExt;

use crate::use_cases::documents::FetchStoredObject;
use crate::use_cases::errors::{DomainError, DomainResult};

const READ_FAILED: &str = "Failed to read the document file";

/// `GET`s a URL a storage provider handed out and returns the whole body.
/// Redirects are followed. An answer that is not 2xx, an unreachable host
/// and a body that breaks off are all internal errors: the URL came from
/// the server's own storage, so none of them is the client's doing.
///
/// No deadline and no size cap, as in `apps/api`, which calls `fetch` bare.
pub async fn fetch_stored_object(client: &reqwest::Client, url: &str) -> DomainResult<Vec<u8>> {
    let response = client.get(url).send().await.map_err(DomainError::internal)?;
    if !response.status().is_success() {
        return Err(DomainError::internal(READ_FAILED));
    }
    let bytes = response.bytes().await.map_err(DomainError::internal)?;
    Ok(bytes.to_vec())
}

/// `fetch_stored_object` over `client`, in the shape the use case takes.
pub fn stored_object_fetcher(client: reqwest::Client) -> FetchStoredObject {
    Arc::new(move |url: String| {
        let client = client.clone();
        async move { fetch_stored_object(&client, &url).await }.boxed()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::net::stub_server::{unreachable_base_url, StubServer};
    use crate::use_cases::errors::ErrorCode;

    #[tokio::test]
    async fn returns_the_body_of_a_successful_answer() {
        let server = StubServer::answering(200, "%PDF-1.7 body").await;
        let fetch = stored_object_fetcher(reqwest::Client::new());

        let bytes = fetch(format!("{}/uploads/users/u1/cv.pdf", server.base_url)).await.unwrap();

        assert_eq!(bytes, b"%PDF-1.7 body");
        let request = server.single_request();
        assert_eq!(request.method, "GET");
        assert_eq!(request.path, "/uploads/users/u1/cv.pdf");
    }

    #[tokio::test]
    async fn an_answer_that_is_not_2xx_is_an_internal_error() {
        for status in [404, 403, 500] {
            let server = StubServer::answering(status, "nope").await;

            let err =
                fetch_stored_object(&reqwest::Client::new(), &server.base_url).await.unwrap_err();

            assert_eq!(err.code(), ErrorCode::InternalError, "{status}");
            assert!(format!("{err:?}").contains(READ_FAILED), "{status}: {err:?}");
        }
    }

    #[tokio::test]
    async fn an_unreachable_host_is_an_internal_error() {
        let url = unreachable_base_url().await;

        let err = fetch_stored_object(&reqwest::Client::new(), &url).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::InternalError);
    }

    #[tokio::test]
    async fn a_url_that_does_not_parse_is_an_internal_error() {
        let err = fetch_stored_object(&reqwest::Client::new(), "not a url").await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::InternalError);
    }
}
