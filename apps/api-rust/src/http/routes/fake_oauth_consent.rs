//! The "provider" side of `FakeOAuthProvider` (`apps/api`'s
//! `fakeOAuthConsent.routes.ts`): mounted only when `OAUTH_PROVIDER_MODE=fake`,
//! so it does not exist as an attack surface in any deployment that does not
//! opt in (never production).
//!
//! It plays the role a real provider's consent screen plays for
//! `/auth/oauth/*`: it receives the same `state` and immediately redirects back
//! to this app's own callback with either a `code` or an `error`. There is no
//! consent UI to click through; a test drives what would be a user's choice
//! through query params (`deny=1`, `email=`, `name=`, `emailVerified=0`).

use axum::extract::RawQuery;
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use axum::routing::get;
use axum::Router;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::Utc;
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use rand::Rng;
use serde_json::{json, Map, Value};

use super::mcp_oauth_helpers::{error_response, parse_query, redirect, string_value};
use super::oauth_platform::request_origin;
use crate::domain::oauth_account::OAuthProviderName;
use crate::http::constants::oauth_sign_in as paths;

const URI_COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')');

const BASE36: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";
const RANDOM_SUFFIX_LENGTH: usize = 6;

pub fn fake_oauth_consent_routes<S: Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route(paths::FAKE_CONSENT, get(consent))
}

fn encode(value: &str) -> String {
    utf8_percent_encode(value, URI_COMPONENT).to_string()
}

async fn consent(headers: HeaderMap, RawQuery(query): RawQuery) -> Response {
    let query = parse_query(query.as_deref());
    let (Some(provider), Some(state)) =
        (query.get("provider").and_then(Value::as_str), query.get("state").and_then(Value::as_str))
    else {
        return error_response(StatusCode::BAD_REQUEST, "Missing provider or state");
    };
    let Some(provider) = OAuthProviderName::parse(provider) else {
        return error_response(StatusCode::NOT_FOUND, "Unknown OAuth provider");
    };

    let redirect_uri =
        format!("{}/auth/oauth/{}/callback", request_origin(&headers), provider.as_str());

    if string_value(&query, "deny") == "1" {
        return redirect(&format!("{redirect_uri}?error=access_denied&state={}", encode(state)));
    }

    let code = URL_SAFE_NO_PAD.encode(fake_profile(&query, provider).to_string());
    redirect(&format!("{redirect_uri}?code={}&state={}", encode(&code), encode(state)))
}

/// Query params let a test pick a specific email/name (e.g. to collide with an
/// existing account and exercise `email_in_use`); otherwise a fresh,
/// unique-enough identity per call so unrelated tests never collide.
fn fake_profile(query: &Map<String, Value>, provider: OAuthProviderName) -> Value {
    let provider = provider.as_str();
    let email = query.get("email").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| {
        format!(
            "fake-{provider}-{}-{}@e2e.example.com",
            Utc::now().timestamp_millis(),
            random_suffix()
        )
    });
    let name = query
        .get("name")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("Fake {provider} user"));
    json!({
        "providerAccountId": format!("fake-{provider}-{email}"),
        "email": email,
        "emailVerified": query.get("emailVerified").and_then(Value::as_str) != Some("0"),
        "name": name,
    })
}

fn random_suffix() -> String {
    let mut rng = rand::thread_rng();
    (0..RANDOM_SUFFIX_LENGTH).map(|_| char::from(BASE36[rng.gen_range(0..BASE36.len())])).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_profile_takes_the_email_and_name_it_is_given() {
        let query = parse_query(Some("email=a%40b.c&name=Ann&emailVerified=0"));
        let profile = fake_profile(&query, OAuthProviderName::Google);
        assert_eq!(profile["email"], "a@b.c");
        assert_eq!(profile["name"], "Ann");
        assert_eq!(profile["emailVerified"], false);
        assert_eq!(profile["providerAccountId"], "fake-google-a@b.c");
    }

    #[test]
    fn a_profile_without_params_is_unique_and_verified() {
        let first = fake_profile(&parse_query(None), OAuthProviderName::Github);
        let second = fake_profile(&parse_query(None), OAuthProviderName::Github);
        assert_ne!(first["email"], second["email"]);
        assert_eq!(first["emailVerified"], true);
        assert_eq!(first["name"], "Fake github user");
    }
}
