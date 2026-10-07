//! What the Google and GitHub sign-in providers share: the HTTP client, the
//! query-string encoding and the error they raise.

use reqwest::StatusCode;

use crate::use_cases::errors::DomainError;

/// GitHub's API answers 403 to a request with no `User-Agent`. Node's `fetch`
/// always sends one (`node`); reqwest sends none unless told to.
const USER_AGENT: &str = "trakwyn-api";

/// The client the OAuth providers call out with. No timeout is set, as
/// `apps/api`'s `fetch` calls set none.
pub fn oauth_http_client() -> Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder().user_agent(USER_AGENT).build()
}

/// `${base}?${new URLSearchParams(params)}`: form encoding (`+` for a space),
/// parameters in the order given.
pub(crate) fn authorization_url(base: &str, params: &[(&str, &str)]) -> String {
    let query = form_urlencoded::Serializer::new(String::new()).extend_pairs(params).finish();
    format!("{base}?{query}")
}

/// A sign-in provider refused, or could not be asked. `apps/api` throws a
/// plain `Error` with these messages, which the OAuth callback turns into a
/// generic "sign-in failed" redirect; none of it reaches the user.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{0}")]
pub struct OAuthExchangeError(String);

impl OAuthExchangeError {
    pub(crate) fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }

    /// `"{what}: {status code}"`.
    pub(crate) fn status(what: &str, status: StatusCode) -> Self {
        Self(format!("{what}: {}", status.as_u16()))
    }

    pub(crate) fn not_set(client_id_env: &str, client_secret_env: &str) -> Self {
        Self(format!("{client_id_env}/{client_secret_env} not set"))
    }
}

impl From<OAuthExchangeError> for DomainError {
    fn from(err: OAuthExchangeError) -> Self {
        DomainError::internal(err)
    }
}

#[cfg(test)]
pub(crate) mod test_support {
    use axum::Router;

    /// Serves `router` on an ephemeral local port for the rest of the test
    /// and returns its base URL (`http://127.0.0.1:{port}`).
    pub(crate) async fn serve(router: Router) -> String {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        format!("http://{address}")
    }
}

#[cfg(test)]
mod tests {
    use axum::http::HeaderMap;
    use axum::routing::get;
    use axum::Router;

    use super::*;

    #[test]
    fn encodes_a_query_the_way_url_search_params_does() {
        assert_eq!(
            authorization_url("https://example.com/authorize", &[("a", "b c"), ("d", "e&f=g/é~*")]),
            "https://example.com/authorize?a=b+c&d=e%26f%3Dg%2F%C3%A9%7E*"
        );
    }

    #[tokio::test]
    async fn the_client_identifies_itself() {
        let router =
            Router::new().route(
                "/",
                get(|headers: HeaderMap| async move {
                    headers["user-agent"].to_str().unwrap().to_string()
                }),
            );
        let base = test_support::serve(router).await;

        let seen =
            oauth_http_client().unwrap().get(&base).send().await.unwrap().text().await.unwrap();

        assert_eq!(seen, "trakwyn-api");
    }
}
