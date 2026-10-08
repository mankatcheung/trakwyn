//! The OAuth sign-in routes (`apps/api`'s `oauth.routes.ts`): `/start` sends
//! the browser to the provider, `/callback` finishes the login or the link,
//! and `/extension/done` is where Safari's tab-based extension login ends.

// A handler's early exit is the finished `Response`; it is built once per
// request, so its size does not matter.
#![allow(clippy::result_large_err)]

use std::sync::Arc;

use axum::extract::{Path, RawQuery, State};
use axum::http::header::{COOKIE, USER_AGENT};
use axum::http::{Extensions, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use chrono::Utc;
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use serde_json::{Map, Value};

use super::mcp_oauth_helpers::{error_response, parse_query, redirect, string_value};
use super::oauth_error_slug::{
    link_error_slug, login_error_slug, provider_error_slug, INVALID_STATE, MISSING_CODE,
    MISSING_USER, PROVIDER_MISMATCH,
};
use super::oauth_platform::{handoff_redirect_base, request_origin, OAuthPlatform};
use crate::domain::oauth_account::OAuthProviderName;
use crate::http::constants::oauth_sign_in::{self as paths, extension_done_page};
use crate::http::constants::{cookies, COOKIE_PATH};
use crate::http::container::Container;
use crate::http::cookies::RequestCookies;
use crate::http::request_context::client_ip;
use crate::infrastructure::auth::{
    create_pkce_pair, is_well_formed_pkce_value, parse_extension_oauth_ids, OAuthStateMode,
    OAUTH_STATE_TTL_MS,
};
use crate::use_cases::oauth::{LinkOAuthAccountInput, LoginOrSignupWithOAuthInput};
use crate::use_cases::sessions::CreateSessionInput;

type Reply = Result<Response, Response>;

/// What `encodeURIComponent` leaves alone.
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

const EXPIRED: &str = "Thu, 01 Jan 1970 00:00:00 GMT";

/// Every part of the redirect cookie is base64url, hex, empty, a fixed
/// platform value or an `[a-p]` extension ID, so none can contain this.
const COOKIE_SEPARATOR: char = '.';

pub fn router<S: Clone + Send + Sync + 'static>(container: Arc<Container>) -> Router<S> {
    Router::new()
        .route(paths::START, get(start))
        .route(paths::CALLBACK, get(callback))
        .route(paths::EXTENSION_DONE, get(extension_done))
        .with_state(container)
}

/// The redirect cookie carries five things the callback needs and the browser
/// must not be able to tamper with: the state's nonce (JEF-198), the
/// provider-facing PKCE verifier (JEF-200), which client started the flow
/// (JEF-275, read even by branches that never verify `state`), the client's
/// own PKCE challenge for the handoff code (mobile and extension), and,
/// extension only, which extension to hand back to. One cookie rather than
/// several, so it cannot arrive with some parts but not others.
struct RedirectCookie {
    nonce: String,
    code_verifier: String,
    platform: OAuthPlatform,
    handoff_code_challenge: String,
    extension_id: String,
}

impl RedirectCookie {
    fn encode(&self) -> String {
        [
            self.nonce.as_str(),
            self.code_verifier.as_str(),
            self.platform.as_str(),
            self.handoff_code_challenge.as_str(),
            self.extension_id.as_str(),
        ]
        .join(&COOKIE_SEPARATOR.to_string())
    }

    fn decode(raw: Option<&str>) -> Option<Self> {
        let mut parts = raw?.split(COOKIE_SEPARATOR);
        let nonce = parts.next().filter(|part| !part.is_empty())?;
        let code_verifier = parts.next().filter(|part| !part.is_empty())?;
        let platform = OAuthPlatform::parse(parts.next());
        Some(Self {
            nonce: nonce.to_string(),
            code_verifier: code_verifier.to_string(),
            platform,
            handoff_code_challenge: parts.next().unwrap_or_default().to_string(),
            extension_id: parts.next().unwrap_or_default().to_string(),
        })
    }
}

/// The signature proves we minted a state; it does not prove we minted it for
/// the browser presenting it. Without this check an attacker can run the flow
/// themselves, keep their own valid code and state, and hand the victim the
/// callback URL, logging the victim into the attacker's account (JEF-198).
/// A missing or half-formed cookie is a hard failure, never a fall-through.
fn state_matches_browser(nonce: &str, cookie_nonce: &str) -> bool {
    !cookie_nonce.is_empty() && cookie_nonce == nonce
}

/// `SameSite=Lax`, deliberately not the `None` the auth cookies use: the
/// callback arrives as a top-level GET navigation, which Lax permits, and
/// anything looser would weaken the very thing this cookie exists to prove.
/// Host-only (no `Domain`) because only this API ever reads it.
fn state_cookie(container: &Container, value: &str) -> String {
    let mut cookie = format!(
        "{}={}; Max-Age={}; Path={COOKIE_PATH}; HttpOnly",
        paths::STATE_COOKIE,
        utf8_percent_encode(value, URI_COMPONENT),
        OAUTH_STATE_TTL_MS / 1000,
    );
    if container.config.is_production() {
        cookie.push_str("; Secure");
    }
    cookie.push_str("; SameSite=Lax");
    cookie
}

fn clear_state_cookie() -> String {
    format!("{}=; Max-Age=0; Path={COOKIE_PATH}; Expires={EXPIRED}", paths::STATE_COOKIE)
}

fn with_cookies(mut response: Response, set_cookies: &[String]) -> Response {
    for value in set_cookies {
        if let Ok(value) = HeaderValue::from_str(value) {
            response.headers_mut().append("set-cookie", value);
        }
    }
    response
}

/// The state cookie is cleared before the handler's own cookies are set, as
/// `apps/api` does, so it leads the `Set-Cookie` list.
fn clearing_state_cookie_first(mut response: Response) -> Response {
    let later: Vec<HeaderValue> =
        response.headers().get_all("set-cookie").iter().cloned().collect();
    response.headers_mut().remove("set-cookie");
    let mut response = with_cookies(response, &[clear_state_cookie()]);
    for value in later {
        response.headers_mut().append("set-cookie", value);
    }
    response
}

fn encode_component(value: &str) -> String {
    utf8_percent_encode(value, URI_COMPONENT).to_string()
}

/// Only a same-site path may be returned to: it is appended to the web app's
/// own origin, and anything that could read as another host is dropped.
fn safe_return_to(value: &str) -> Option<&str> {
    (value.starts_with('/') && !value.starts_with("//")).then_some(value)
}

/// A plain sign-in with no captured destination lands on the dashboard, not
/// `/`: the landing page does not redirect logged-in visitors elsewhere.
fn return_to_url(web_app_origin: &str, return_to: Option<&str>) -> String {
    match return_to.filter(|path| !path.is_empty()) {
        Some(path) => format!("{web_app_origin}{path}"),
        None => format!("{web_app_origin}/dashboard"),
    }
}

fn parse_provider(provider: &str) -> Result<OAuthProviderName, Response> {
    OAuthProviderName::parse(provider)
        .ok_or_else(|| error_response(StatusCode::NOT_FOUND, "Unknown OAuth provider"))
}

fn settled(reply: Reply) -> Response {
    reply.unwrap_or_else(|response| response)
}

fn request_cookies(headers: &HeaderMap) -> RequestCookies {
    headers
        .get(COOKIE)
        .and_then(|value| value.to_str().ok())
        .map(RequestCookies::parse)
        .unwrap_or_default()
}

/// A JSON `{ error }` body in Fastify's shape, for the failures `/start`
/// answers directly (the browser is not yet at the provider).
fn json_error(status: StatusCode, message: &str) -> Response {
    error_response(status, message)
}

async fn start(
    State(container): State<Arc<Container>>,
    Path(provider): Path<String>,
    headers: HeaderMap,
    RawQuery(query): RawQuery,
) -> Response {
    settled(begin(&container, &provider, &headers, &parse_query(query.as_deref())))
}

fn begin(
    container: &Container,
    provider: &str,
    headers: &HeaderMap,
    query: &Map<String, Value>,
) -> Reply {
    let provider = parse_provider(provider)?;
    let mode = if string_value(query, "mode") == "link" {
        OAuthStateMode::Link
    } else {
        OAuthStateMode::Login
    };
    // Only meaningful for login (linking only starts from the web settings
    // page), but read unconditionally so it is always in the cookie.
    let platform = OAuthPlatform::parse(Some(string_value(query, "platform")));

    // The client's own PKCE, over the handoff code: distinct from the
    // provider-facing pair below. Required (JEF-275): a client that omitted
    // it would get a handoff code nothing binds to it.
    let mut handoff_code_challenge = String::new();
    if platform != OAuthPlatform::Web {
        let challenge = string_value(query, "codeChallenge");
        if !is_well_formed_pkce_value(challenge) {
            return Err(json_error(StatusCode::BAD_REQUEST, "Missing or malformed codeChallenge"));
        }
        handoff_code_challenge = challenge.to_string();
    }

    // Only an allowlisted extension may be redirected to (JEF-383): the ID
    // names the host the handoff code is sent to.
    let mut extension_id = String::new();
    if platform == OAuthPlatform::Extension {
        let requested = string_value(query, "extensionId");
        let allowed =
            parse_extension_oauth_ids(container.config.auth.extension_oauth_ids.as_deref());
        if !allowed.contains(requested) {
            return Err(json_error(StatusCode::BAD_REQUEST, "Unknown extensionId"));
        }
        extension_id = requested.to_string();
    }

    let mut user_id: Option<String> = None;
    if mode == OAuthStateMode::Link {
        let cookies = request_cookies(headers);
        let Some(token) = cookies.get(cookies::ACCESS_TOKEN).filter(|token| !token.is_empty())
        else {
            return Err(json_error(
                StatusCode::UNAUTHORIZED,
                "Must be logged in to link a provider",
            ));
        };
        match container.token_service.verify_access(token) {
            Some(claims) => user_id = Some(claims.sub),
            None => return Err(json_error(StatusCode::UNAUTHORIZED, "Session expired")),
        }
    }

    let configured = match provider {
        OAuthProviderName::Google => container.config.auth.google_oauth.is_some(),
        OAuthProviderName::Github => container.config.auth.github_oauth.is_some(),
    };
    if !configured {
        return Err(json_error(
            StatusCode::SERVICE_UNAVAILABLE,
            &format!("{} OAuth is not configured", provider.as_str()),
        ));
    }

    let return_to = match mode {
        OAuthStateMode::Login => safe_return_to(string_value(query, "returnTo")),
        OAuthStateMode::Link => None,
    };
    let services = &container.services;
    let issued = services.oauth_state_service.issue(provider, mode, user_id.as_deref(), return_to);
    // Only the challenge (the hash) goes to the provider. The verifier stays
    // here, in the cookie, so capturing the redirect URL reveals nothing that
    // could redeem the code.
    let pkce = create_pkce_pair();
    let authorization_url = services.oauth_provider_registry.get(provider).get_authorization_url(
        &issued.state,
        &callback_url(headers, provider),
        &pkce.challenge,
    );

    let cookie = RedirectCookie {
        nonce: issued.nonce,
        code_verifier: pkce.verifier,
        platform,
        handoff_code_challenge,
        extension_id,
    };
    // Set on the same response as the redirect, so the browser carries it
    // through the provider and back.
    Ok(with_cookies(redirect(&authorization_url), &[state_cookie(container, &cookie.encode())]))
}

fn callback_url(headers: &HeaderMap, provider: OAuthProviderName) -> String {
    format!("{}/auth/oauth/{}/callback", request_origin(headers), provider.as_str())
}

/// Everything `/callback` reads off the request, once.
struct CallbackRequest {
    provider: OAuthProviderName,
    headers: HeaderMap,
    peer_ip: Option<String>,
    cookie: Option<RedirectCookie>,
    code: String,
    state: String,
    error: String,
}

async fn callback(
    State(container): State<Arc<Container>>,
    Path(provider): Path<String>,
    headers: HeaderMap,
    extensions: Extensions,
    RawQuery(query): RawQuery,
) -> Response {
    let provider = match parse_provider(&provider) {
        Ok(provider) => provider,
        Err(response) => return response,
    };
    let query = parse_query(query.as_deref());
    let peer = extensions
        .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
        .map(|axum::extract::ConnectInfo(peer)| *peer);
    let raw_cookie = request_cookies(&headers).get(paths::STATE_COOKIE).map(str::to_string);
    let request = CallbackRequest {
        provider,
        peer_ip: client_ip(&headers, peer),
        cookie: RedirectCookie::decode(raw_cookie.as_deref()),
        code: string_value(&query, "code").to_string(),
        state: string_value(&query, "state").to_string(),
        error: string_value(&query, "error").to_string(),
        headers,
    };
    // Cleared once here rather than on each branch: this handler has many
    // ways out, and a stale nonce left behind would block the user's next
    // attempt. The value was read above, so clearing does not affect the checks.
    clearing_state_cookie_first(finish(&container, &request).await)
}

async fn finish(container: &Container, request: &CallbackRequest) -> Response {
    let web_app_origin = container.services.web_app_origin.as_str();
    let provider = request.provider;
    // Read even by branches that never reach a verified `state`, which is
    // exactly why platform lives in the cookie and not in it.
    let handoff_base = request.cookie.as_ref().and_then(|cookie| {
        handoff_redirect_base(
            cookie.platform,
            &cookie.extension_id,
            &parse_extension_oauth_ids(container.config.auth.extension_oauth_ids.as_deref()),
            &request_origin(&request.headers),
        )
    });
    let login_error = |slug: &str| match &handoff_base {
        Some(base) => redirect(&format!("{base}?oauthError={slug}")),
        None => redirect(&format!("{web_app_origin}/login?oauthError={slug}")),
    };

    if !request.error.is_empty() {
        return login_error(provider_error_slug(&request.error));
    }
    if request.code.is_empty() || request.state.is_empty() {
        return login_error(MISSING_CODE);
    }
    let Ok(state) = container.services.oauth_state_service.verify(&request.state) else {
        return login_error(INVALID_STATE);
    };
    if state.provider != provider {
        return login_error(PROVIDER_MISMATCH);
    }
    let Some(cookie) =
        request.cookie.as_ref().filter(|cookie| state_matches_browser(&state.nonce, &cookie.nonce))
    else {
        return login_error(INVALID_STATE);
    };

    let redirect_uri = callback_url(&request.headers, provider);

    if state.mode == OAuthStateMode::Link {
        return link(container, request, &state, &cookie.code_verifier, redirect_uri).await;
    }

    let handoff_challenge = handoff_base.as_ref().map(|_| cookie.handoff_code_challenge.as_str());
    match sign_in(container, request, &cookie.code_verifier, redirect_uri, handoff_challenge).await
    {
        Ok(SignedIn::Handoff(code)) => {
            let base = handoff_base.unwrap_or_default();
            redirect(&format!("{base}?code={}", encode_component(&code)))
        }
        Ok(SignedIn::Cookies(set_cookies)) => with_cookies(
            redirect(&return_to_url(web_app_origin, state.return_to.as_deref())),
            &set_cookies,
        ),
        Err(err) => {
            container.services.logger.error(
                &format!("OAuth login failed for {}", provider.as_str()),
                Some(&err),
                &[],
            );
            login_error(login_error_slug(&err))
        }
    }
}

/// The linked-accounts UI lives at `/settings/security`, not `/account` (which
/// redirects to `/settings/profile` and drops the query string), so land there
/// directly and the feedback params actually get seen.
async fn link(
    container: &Container,
    request: &CallbackRequest,
    state: &crate::infrastructure::auth::OAuthState,
    code_verifier: &str,
    redirect_uri: String,
) -> Response {
    let web_app_origin = container.services.web_app_origin.as_str();
    let provider = request.provider;
    let Some(user_id) = state.user_id.as_deref().filter(|id| !id.is_empty()) else {
        return redirect(&format!("{web_app_origin}/settings/security?oauthError={MISSING_USER}"));
    };
    let result = container
        .link_oauth_account_use_case()
        .execute(LinkOAuthAccountInput {
            user_id: user_id.to_string(),
            provider,
            code: request.code.clone(),
            redirect_uri,
            code_verifier: code_verifier.to_string(),
        })
        .await;
    match result {
        Ok(()) => redirect(&format!(
            "{web_app_origin}/settings/security?oauthLinked={}",
            provider.as_str()
        )),
        Err(err) => {
            // Logged, not shown: keeping raw error detail out of the redirect
            // URL must not mean losing it entirely.
            container.services.logger.error(
                &format!("OAuth link failed for {}", provider.as_str()),
                Some(&err),
                &[],
            );
            redirect(&format!(
                "{web_app_origin}/settings/security?oauthError={}",
                link_error_slug(&err)
            ))
        }
    }
}

enum SignedIn {
    /// Mobile and extension: no cookie jar tied to the API, so the tokens
    /// cross the redirect as an opaque, short-lived handoff code instead.
    Handoff(String),
    Cookies(Vec<String>),
}

async fn sign_in(
    container: &Container,
    request: &CallbackRequest,
    code_verifier: &str,
    redirect_uri: String,
    handoff_challenge: Option<&str>,
) -> crate::use_cases::errors::DomainResult<SignedIn> {
    let output = container
        .login_or_signup_with_oauth_use_case()
        .execute(LoginOrSignupWithOAuthInput {
            provider: request.provider,
            code: request.code.clone(),
            redirect_uri,
            code_verifier: code_verifier.to_string(),
        })
        .await?;
    let user = output.user;
    let user_agent =
        request.headers.get(USER_AGENT).and_then(|value| value.to_str().ok()).map(str::to_string);
    let session = container
        .create_session_use_case()
        .execute(CreateSessionInput {
            user_id: user.id.clone(),
            user_agent,
            ip_address: request.peer_ip.clone(),
        })
        .await?;
    let tokens = container.token_service.sign(
        &user.id,
        &user.email,
        &session.id,
        session.current_refresh_token_id.as_deref().unwrap_or_default(),
        Utc::now().timestamp_millis(),
    )?;
    Ok(match handoff_challenge {
        Some(challenge) => {
            SignedIn::Handoff(container.services.mobile_oauth_handoff_service.issue(
                &tokens.access_token,
                &tokens.refresh_token,
                challenge,
            ))
        }
        None => SignedIn::Cookies(
            container.auth_cookies.sign_in(&tokens.access_token, &tokens.refresh_token),
        ),
    })
}

async fn extension_done() -> Response {
    let mut response = (StatusCode::OK, extension_done_page::HTML).into_response();
    for (name, value) in extension_done_page::HEADERS {
        response
            .headers_mut()
            .insert(axum::http::HeaderName::from_static(name), HeaderValue::from_static(value));
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_redirect_cookie_round_trips() {
        let cookie = RedirectCookie {
            nonce: "n".into(),
            code_verifier: "v".into(),
            platform: OAuthPlatform::Extension,
            handoff_code_challenge: "c".into(),
            extension_id: "e".into(),
        };
        let decoded = RedirectCookie::decode(Some(&cookie.encode())).unwrap();
        assert_eq!(decoded.nonce, "n");
        assert_eq!(decoded.code_verifier, "v");
        assert_eq!(decoded.platform, OAuthPlatform::Extension);
        assert_eq!(decoded.handoff_code_challenge, "c");
        assert_eq!(decoded.extension_id, "e");
    }

    #[test]
    fn a_half_formed_redirect_cookie_is_refused() {
        assert!(RedirectCookie::decode(None).is_none());
        assert!(RedirectCookie::decode(Some("")).is_none());
        assert!(RedirectCookie::decode(Some("nonce")).is_none());
        assert!(RedirectCookie::decode(Some(".verifier")).is_none());
        let web = RedirectCookie::decode(Some("n.v")).unwrap();
        assert_eq!(web.platform, OAuthPlatform::Web);
        assert_eq!(web.handoff_code_challenge, "");
    }

    #[test]
    fn a_missing_or_different_nonce_never_matches() {
        assert!(state_matches_browser("abc", "abc"));
        assert!(!state_matches_browser("abc", ""));
        assert!(!state_matches_browser("abc", "abd"));
    }

    #[test]
    fn return_to_must_be_a_same_site_path() {
        assert_eq!(safe_return_to("/jobs?x=1"), Some("/jobs?x=1"));
        assert_eq!(safe_return_to("//evil.example"), None);
        assert_eq!(safe_return_to("https://evil.example"), None);
        assert_eq!(safe_return_to(""), None);
    }

    #[test]
    fn a_login_without_a_destination_lands_on_the_dashboard() {
        assert_eq!(return_to_url("https://app", None), "https://app/dashboard");
        assert_eq!(return_to_url("https://app", Some("")), "https://app/dashboard");
        assert_eq!(return_to_url("https://app", Some("/jobs")), "https://app/jobs");
    }
}
