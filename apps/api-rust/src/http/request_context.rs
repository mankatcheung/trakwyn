//! What a resolver knows about the request it is answering.

use std::net::SocketAddr;

use axum::http::header::{AsHeaderName, AUTHORIZATION, COOKIE, USER_AGENT};
use axum::http::HeaderMap;

use crate::http::constants::{cookies, BEARER_PREFIX};
use crate::http::container::Container;
use crate::http::cookies::RequestCookies;
use crate::use_cases::auth::AuthenticatedUser;

const FORWARDED_FOR: &str = "x-forwarded-for";

/// The caller's IP and user agent, for login and security-event records.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DeviceInfo {
    pub user_agent: Option<String>,
    pub ip_address: Option<String>,
}

pub struct RequestContext {
    /// `None` when the request carried no token, or one that did not verify.
    pub user: Option<AuthenticatedUser>,
    pub device: DeviceInfo,
    pub cookies: RequestCookies,
}

fn header(headers: &HeaderMap, name: impl AsHeaderName) -> Option<&str> {
    headers.get(name).and_then(|value| value.to_str().ok())
}

/// The client's address. The API sits behind Cloud Run's front end, which
/// appends to `X-Forwarded-For`, so the left-most entry is the client; the
/// socket's peer is only the proxy. Same trust as `apps/api`'s `trustProxy`.
fn client_ip(headers: &HeaderMap, peer: Option<SocketAddr>) -> Option<String> {
    header(headers, FORWARDED_FOR)
        .and_then(|forwarded| forwarded.split(',').next())
        .map(str::trim)
        .filter(|ip| !ip.is_empty())
        .map(str::to_string)
        .or_else(|| peer.map(|peer| peer.ip().to_string()))
}

impl RequestContext {
    /// Reads the token from the access cookie, falling back to
    /// `Authorization: Bearer` for clients that hold no cookie (API tokens,
    /// the browser extension, mobile).
    pub async fn from_request(
        container: &Container,
        headers: &HeaderMap,
        peer: Option<SocketAddr>,
    ) -> Self {
        let cookies = header(headers, COOKIE).map(RequestCookies::parse).unwrap_or_default();
        let bearer =
            header(headers, AUTHORIZATION).and_then(|value| value.strip_prefix(BEARER_PREFIX));
        let raw_token = cookies.get(cookies::ACCESS_TOKEN).or(bearer);

        let user = match raw_token {
            Some(token) => container.authenticate_request_use_case().execute(token).await,
            None => None,
        };

        Self {
            user,
            device: DeviceInfo {
                user_agent: header(headers, USER_AGENT).map(str::to_string),
                ip_address: client_ip(headers, peer),
            },
            cookies,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn headers(pairs: &[(&'static str, &'static str)]) -> HeaderMap {
        pairs
            .iter()
            .map(|(name, value)| (name.parse().unwrap(), HeaderValue::from_static(value)))
            .collect()
    }

    #[test]
    fn takes_the_left_most_forwarded_address() {
        let headers = headers(&[("x-forwarded-for", "203.0.113.7, 10.0.0.1")]);
        let peer = "10.0.0.1:443".parse().ok();
        assert_eq!(client_ip(&headers, peer).as_deref(), Some("203.0.113.7"));
    }

    #[test]
    fn falls_back_to_the_socket_peer() {
        let peer = "127.0.0.1:5000".parse().ok();
        assert_eq!(client_ip(&HeaderMap::new(), peer).as_deref(), Some("127.0.0.1"));
    }

    #[test]
    fn has_no_address_without_either() {
        assert_eq!(client_ip(&HeaderMap::new(), None), None);
    }
}
