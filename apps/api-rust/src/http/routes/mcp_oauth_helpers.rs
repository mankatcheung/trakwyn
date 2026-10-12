//! Request parsing, validation and redirect building for the MCP OAuth
//! routes (`apps/api`'s `mcpOAuth.helpers.ts`), kept apart from the route
//! table so the parts that decide what is granted are testable on their own.

// A refused request is answered with its finished `Response`, built once.
#![allow(clippy::result_large_err)]

use axum::http::header::{CONTENT_TYPE, COOKIE, HOST, ORIGIN, USER_AGENT};
use axum::http::{Extensions, HeaderMap, HeaderName, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::{json, Map, Value};
use url::Url;

use crate::domain::mcp_oauth::McpOAuthScope;
use crate::http::constants::cookies;
use crate::http::cookies::RequestCookies;
use crate::http::request_context::client_ip;
use crate::use_cases::documents::js_whitespace::is_js_whitespace;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::McpOAuthClientRepository;

const FORWARDED_PROTO: HeaderName = HeaderName::from_static("x-forwarded-proto");
const JSON_CONTENT_TYPE: &str = "application/json; charset=utf-8";
const FORM_CONTENT_TYPE: &str = "application/x-www-form-urlencoded";
/// Used when neither `API_ORIGIN` nor a `Host` header names the server.
const FALLBACK_HOST: &str = "localhost:3001";

/// What the handlers need to know about the request, read once.
pub struct RequestMeta {
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    origin: Option<String>,
    host: Option<String>,
    protocol: String,
    access_cookie: Option<String>,
}

impl RequestMeta {
    pub fn new(headers: &HeaderMap, extensions: &Extensions) -> Self {
        let text = |name: &HeaderName| {
            headers.get(name).and_then(|value| value.to_str().ok()).map(str::to_string)
        };
        let peer = extensions
            .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
            .map(|axum::extract::ConnectInfo(peer)| *peer);
        let protocol = text(&FORWARDED_PROTO)
            .and_then(|value| value.split(',').next().map(|first| first.trim().to_string()))
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "http".to_string());
        let access_cookie = text(&COOKIE)
            .map(|header| RequestCookies::parse(&header))
            .and_then(|cookies| cookies.get(cookies::ACCESS_TOKEN).map(str::to_string));
        Self {
            ip: client_ip(headers, peer),
            user_agent: text(&USER_AGENT),
            origin: text(&ORIGIN),
            host: text(&HOST),
            protocol,
            access_cookie,
        }
    }

    pub fn origin(&self) -> Option<&str> {
        self.origin.as_deref()
    }

    pub fn access_cookie(&self) -> Option<&str> {
        self.access_cookie.as_deref()
    }
}

/// The issuer this authorization server advertises.
///
/// Deliberately not derived from the request's Host header: discovery
/// metadata names the endpoints a client will send credentials to, so letting
/// a caller choose the host means letting it point clients elsewhere. Falls
/// back to the request origin only when unconfigured, the local-dev case.
pub fn issuer_origin(configured: Option<String>, meta: &RequestMeta) -> String {
    configured.unwrap_or_else(|| {
        let host = meta.host.as_deref().unwrap_or(FALLBACK_HOST);
        format!("{}://{host}", meta.protocol)
    })
}

/// The rate-limit key: `<route>:<subject category>:<value…>`. The category
/// comes before anything variable so a rejection can be logged as "an IP was
/// limited on mcp-oauth" without the address reaching the log. `suffix` is the
/// client id on `/authorize`, i.e. user-supplied, so it stays behind the
/// category too.
pub fn limiter_key(meta: &RequestMeta, suffix: &str) -> String {
    let subject = meta.ip.as_deref().or(meta.user_agent.as_deref()).unwrap_or("unknown");
    format!("mcp-oauth:ip:{subject}:{suffix}")
}

/// A JSON response in the shape Fastify sends.
pub fn json_response(status: StatusCode, body: &Value) -> Response {
    let mut response = (status, body.to_string()).into_response();
    response.headers_mut().insert(CONTENT_TYPE, HeaderValue::from_static(JSON_CONTENT_TYPE));
    response
}

/// RFC 6749 s5.1: credentials must never be cached.
pub fn no_store(mut response: Response) -> Response {
    let headers = response.headers_mut();
    headers.insert("cache-control", HeaderValue::from_static("no-store"));
    headers.insert("pragma", HeaderValue::from_static("no-cache"));
    response
}

pub fn error_response(status: StatusCode, error: &str) -> Response {
    json_response(status, &json!({ "error": error }))
}

/// A `302` to `location`, as Fastify's `reply.redirect` answers.
pub fn redirect(location: &str) -> Response {
    let mut response = StatusCode::FOUND.into_response();
    if let Ok(value) = HeaderValue::from_str(location) {
        response.headers_mut().insert("location", value);
    }
    response
}

/// A failure that is not the client's to fix. The cause is logged, not sent.
pub fn internal_error(cause: &dyn std::fmt::Debug) -> Response {
    tracing::error!(error = ?cause, "[mcp-oauth] request failed");
    json_response(
        StatusCode::INTERNAL_SERVER_ERROR,
        &json!({
            "statusCode": 500,
            "error": "Internal Server Error",
            "message": "Internal Server Error",
        }),
    )
}

fn fastify_error(status: StatusCode, code: &str, error: &str, message: &str) -> Response {
    json_response(
        status,
        &json!({ "statusCode": status.as_u16(), "code": code, "error": error, "message": message }),
    )
}

fn media_type(headers: &HeaderMap) -> Option<String> {
    let value = headers.get(CONTENT_TYPE)?.to_str().ok()?;
    Some(value.split(';').next().unwrap_or_default().trim().to_ascii_lowercase())
}

/// The body as Fastify hands it to a route: JSON and
/// `application/x-www-form-urlencoded` are parsed, no body is empty, and
/// anything else is refused before the handler runs. A body that is not an
/// object reads as empty (`asRecord`).
pub fn parse_body(headers: &HeaderMap, body: &[u8]) -> Result<Map<String, Value>, Response> {
    let Some(media_type) = media_type(headers) else {
        if body.is_empty() {
            return Ok(Map::new());
        }
        return Err(unsupported_media_type());
    };
    match media_type.as_str() {
        "application/json" => {
            if body.is_empty() {
                return Err(fastify_error(
                    StatusCode::BAD_REQUEST,
                    "FST_ERR_CTP_EMPTY_JSON_BODY",
                    "Bad Request",
                    "Body cannot be empty when content-type is set to 'application/json'",
                ));
            }
            match serde_json::from_slice::<Value>(body) {
                Ok(Value::Object(map)) => Ok(map),
                Ok(_) => Ok(Map::new()),
                Err(_) => Err(fastify_error(
                    StatusCode::BAD_REQUEST,
                    "FST_ERR_CTP_INVALID_JSON_BODY",
                    "Bad Request",
                    "Body is not valid JSON but content-type is set to 'application/json'",
                )),
            }
        }
        FORM_CONTENT_TYPE => {
            // `Object.fromEntries(new URLSearchParams(body))`: the last of a
            // repeated name wins.
            let mut map = Map::new();
            for (name, value) in form_urlencoded::parse(body) {
                map.insert(name.into_owned(), Value::String(value.into_owned()));
            }
            Ok(map)
        }
        _ => Err(unsupported_media_type()),
    }
}

fn unsupported_media_type() -> Response {
    fastify_error(
        StatusCode::UNSUPPORTED_MEDIA_TYPE,
        "FST_ERR_CTP_INVALID_MEDIA_TYPE",
        "Unsupported Media Type",
        "Unsupported Media Type",
    )
}

/// The query string as Fastify parses it: a name given twice is an array,
/// which `string_value` then reads as absent.
pub fn parse_query(raw: Option<&str>) -> Map<String, Value> {
    let mut map = Map::new();
    for (name, value) in form_urlencoded::parse(raw.unwrap_or_default().as_bytes()) {
        let value = Value::String(value.into_owned());
        match map.get_mut(name.as_ref()) {
            Some(Value::Array(values)) => values.push(value),
            Some(existing) => {
                let first = existing.take();
                *existing = Value::Array(vec![first, value]);
            }
            None => {
                map.insert(name.into_owned(), value);
            }
        }
    }
    map
}

pub fn string_value<'a>(map: &'a Map<String, Value>, key: &str) -> &'a str {
    map.get(key).and_then(Value::as_str).unwrap_or_default()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorizationRequest {
    pub client_id: String,
    pub redirect_uri: String,
    pub response_type: String,
    /// The effective scope, already resolved from the space-delimited
    /// request. `None` when the request named something we do not offer.
    pub scope: Option<McpOAuthScope>,
    pub code_challenge: String,
    pub code_challenge_method: String,
    pub state: Option<String>,
}

impl AuthorizationRequest {
    pub fn from_map(map: &Map<String, Value>) -> Self {
        let value = |key: &str| string_value(map, key).to_string();
        Self {
            client_id: value("client_id"),
            redirect_uri: value("redirect_uri"),
            response_type: value("response_type"),
            scope: resolve_scope(string_value(map, "scope")),
            code_challenge: value("code_challenge"),
            code_challenge_method: value("code_challenge_method"),
            state: Some(value("state")).filter(|state| !state.is_empty()),
        }
    }
}

/// `scope` is a space-delimited list (RFC 6749 s3.3), not a single value, and
/// a client that reads our `scopes_supported` is entitled to ask for
/// everything in it (`mcp-remote` and Claude's connector both request "read
/// full").
///
/// Ours are privilege levels rather than independent capabilities, so a
/// request naming both resolves to the higher one. The granted scope is what
/// the consent screen displays and what the token response echoes back.
///
/// `None` for an empty list or any scope we do not offer, which the caller
/// reports as `invalid_scope`.
pub fn resolve_scope(requested: &str) -> Option<McpOAuthScope> {
    let names: Vec<&str> =
        requested.split(is_js_whitespace).filter(|name| !name.is_empty()).collect();
    if names.is_empty() || names.iter().any(|name| *name != "read" && *name != "full") {
        return None;
    }
    Some(if names.contains(&"full") { McpOAuthScope::Full } else { McpOAuthScope::Read })
}

/// Either the request is good and carries the client plus the scope actually
/// granted, or it failed.
#[derive(Debug, PartialEq, Eq)]
pub enum AuthorizationValidation {
    Valid {
        client_name: String,
        scope: McpOAuthScope,
    },
    Invalid {
        error: &'static str,
        /// Whether the error may be reported to `redirect_uri` rather than inline.
        redirectable: bool,
    },
}

pub async fn validate_authorization_request(
    clients: &dyn McpOAuthClientRepository,
    request: &AuthorizationRequest,
) -> DomainResult<AuthorizationValidation> {
    let invalid = |error, redirectable| AuthorizationValidation::Invalid { error, redirectable };
    if request.client_id.is_empty() || request.redirect_uri.is_empty() {
        return Ok(invalid("invalid_request", false));
    }

    let client = match clients.find_by_id(&request.client_id).await? {
        Some(client)
            if client.revoked_at.is_none()
                && client.redirect_uris.contains(&request.redirect_uri) =>
        {
            client
        }
        _ => return Ok(invalid("invalid_client", false)),
    };

    // Past this point the redirect target is a URI this client registered, so
    // errors can safely be handed back to it.
    if request.response_type != "code" {
        return Ok(invalid("unsupported_response_type", true));
    }
    if request.code_challenge.is_empty() || request.code_challenge_method != "S256" {
        return Ok(invalid("invalid_request", true));
    }
    let Some(scope) = request.scope else {
        return Ok(invalid("invalid_scope", true));
    };
    Ok(AuthorizationValidation::Valid { client_name: client.name, scope })
}

/// `redirect_uri` with `name=value` set the way `URLSearchParams.set` does:
/// the first occurrence is replaced, later ones dropped, and the query is
/// re-serialized form-urlencoded. `None` if `redirect_uri` is not a URL.
fn redirect_with(request: &AuthorizationRequest, name: &str, value: &str) -> Option<String> {
    let mut url = Url::parse(&request.redirect_uri).ok()?;
    set_query_param(&mut url, name, value);
    if let Some(state) = &request.state {
        set_query_param(&mut url, "state", state);
    }
    Some(url.to_string())
}

fn set_query_param(url: &mut Url, name: &str, value: &str) {
    let mut pairs: Vec<(String, String)> =
        url.query_pairs().map(|(key, value)| (key.into_owned(), value.into_owned())).collect();
    match pairs.iter().position(|(key, _)| key == name) {
        Some(index) => {
            pairs[index].1 = value.to_string();
            let mut seen = false;
            pairs.retain(|(key, _)| {
                let keep = key != name || !seen;
                seen |= key == name;
                keep
            });
        }
        None => pairs.push((name.to_string(), value.to_string())),
    }
    url.query_pairs_mut().clear().extend_pairs(pairs);
}

pub fn build_code_redirect(request: &AuthorizationRequest, code: &str) -> Option<String> {
    redirect_with(request, "code", code)
}

pub fn build_error_redirect(request: &AuthorizationRequest, error: &str) -> Option<String> {
    redirect_with(request, "error", error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::mcp_oauth::McpOAuthClient;
    use crate::use_cases::clock::now;
    use crate::use_cases::test_support::FakeMcpOAuthClientRepository;

    const REDIRECT: &str = "http://localhost:6274/oauth/callback";

    fn request(pairs: &[(&str, &str)]) -> AuthorizationRequest {
        let map = pairs.iter().map(|(k, v)| (k.to_string(), json!(v))).collect();
        AuthorizationRequest::from_map(&map)
    }

    fn good(overrides: &[(&str, &str)]) -> AuthorizationRequest {
        let mut pairs = vec![
            ("client_id", "c1"),
            ("redirect_uri", REDIRECT),
            ("response_type", "code"),
            ("scope", "read"),
            ("code_challenge", "abc"),
            ("code_challenge_method", "S256"),
        ];
        pairs.retain(|(key, _)| !overrides.iter().any(|(name, _)| name == key));
        pairs.extend_from_slice(overrides);
        request(&pairs)
    }

    fn clients(revoked: bool) -> FakeMcpOAuthClientRepository {
        FakeMcpOAuthClientRepository::with(vec![McpOAuthClient {
            id: "c1".to_string(),
            name: "Claude".to_string(),
            redirect_uris: vec![REDIRECT.to_string()],
            revoked_at: revoked.then(now),
            created_at: now(),
        }])
    }

    async fn validate(request: &AuthorizationRequest) -> AuthorizationValidation {
        validate_authorization_request(&clients(false), request).await.unwrap()
    }

    fn invalid(error: &'static str, redirectable: bool) -> AuthorizationValidation {
        AuthorizationValidation::Invalid { error, redirectable }
    }

    #[test]
    fn a_scope_list_resolves_to_the_highest_privilege_or_nothing() {
        assert_eq!(resolve_scope("read"), Some(McpOAuthScope::Read));
        assert_eq!(resolve_scope("full"), Some(McpOAuthScope::Full));
        assert_eq!(resolve_scope("read full"), Some(McpOAuthScope::Full));
        assert_eq!(resolve_scope("  full \t read\n"), Some(McpOAuthScope::Full));
        assert_eq!(resolve_scope(""), None);
        assert_eq!(resolve_scope("   "), None);
        assert_eq!(resolve_scope("read admin"), None);
        assert_eq!(resolve_scope("READ"), None);
    }

    #[tokio::test]
    async fn validates_a_good_request_with_the_resolved_scope() {
        let valid = AuthorizationValidation::Valid {
            client_name: "Claude".to_string(),
            scope: McpOAuthScope::Full,
        };
        assert_eq!(validate(&good(&[("scope", "read full")])).await, valid);
    }

    #[tokio::test]
    async fn an_unverified_redirect_uri_never_receives_an_error() {
        assert_eq!(validate(&good(&[("client_id", "")])).await, invalid("invalid_request", false));
        assert_eq!(
            validate(&good(&[("redirect_uri", "")])).await,
            invalid("invalid_request", false)
        );
        assert_eq!(
            validate(&good(&[("client_id", "nope")])).await,
            invalid("invalid_client", false)
        );
        assert_eq!(
            validate(&good(&[("redirect_uri", "http://localhost:6274/other")])).await,
            invalid("invalid_client", false)
        );
        let revoked = validate_authorization_request(&clients(true), &good(&[])).await.unwrap();
        assert_eq!(revoked, invalid("invalid_client", false));
    }

    #[tokio::test]
    async fn errors_after_the_client_is_known_are_redirectable() {
        assert_eq!(
            validate(&good(&[("response_type", "token")])).await,
            invalid("unsupported_response_type", true)
        );
        assert_eq!(
            validate(&good(&[("code_challenge", "")])).await,
            invalid("invalid_request", true)
        );
        assert_eq!(
            validate(&good(&[("code_challenge_method", "plain")])).await,
            invalid("invalid_request", true)
        );
        assert_eq!(validate(&good(&[("scope", "admin")])).await, invalid("invalid_scope", true));
        assert_eq!(validate(&good(&[("scope", "")])).await, invalid("invalid_scope", true));
    }

    #[test]
    fn a_code_redirect_carries_the_code_and_state_and_keeps_the_query() {
        let mut with_state = good(&[("state", "xyz 1")]);
        assert_eq!(
            build_code_redirect(&with_state, "the-code").as_deref(),
            Some("http://localhost:6274/oauth/callback?code=the-code&state=xyz+1")
        );
        with_state.state = None;
        with_state.redirect_uri = "https://app.example.com/cb?x=1&code=old&code=dup".to_string();
        assert_eq!(
            build_code_redirect(&with_state, "new").as_deref(),
            Some("https://app.example.com/cb?x=1&code=new")
        );
    }

    #[test]
    fn an_error_redirect_carries_the_error_and_state_and_survives_a_fragment() {
        let mut request = good(&[("state", "s")]);
        request.redirect_uri = "https://app.example.com/cb#frag".to_string();
        assert_eq!(
            build_error_redirect(&request, "access_denied").as_deref(),
            Some("https://app.example.com/cb?error=access_denied&state=s#frag")
        );
        request.redirect_uri = "not a url".to_string();
        assert_eq!(build_error_redirect(&request, "access_denied"), None);
    }

    #[test]
    fn an_empty_state_is_no_state() {
        assert_eq!(good(&[("state", "")]).state, None);
    }

    fn headers(content_type: Option<&str>) -> HeaderMap {
        let mut headers = HeaderMap::new();
        if let Some(value) = content_type {
            headers.insert(CONTENT_TYPE, HeaderValue::from_str(value).unwrap());
        }
        headers
    }

    #[test]
    fn parses_json_and_form_bodies() {
        let json_body =
            parse_body(&headers(Some("Application/JSON; charset=utf-8")), br#"{"a":"b","n":1}"#);
        assert_eq!(json_body.unwrap()["a"], "b");
        let form = parse_body(&headers(Some(FORM_CONTENT_TYPE)), b"a=1&a=2&b=x%20y+z").unwrap();
        assert_eq!(form["a"], "2");
        assert_eq!(form["b"], "x y z");
        assert!(parse_body(&headers(None), b"").unwrap().is_empty());
        assert!(parse_body(&headers(Some("application/json")), b"[1]").unwrap().is_empty());
    }

    #[test]
    fn refuses_bodies_fastify_refuses() {
        let status = |result: Result<Map<String, Value>, Response>| result.unwrap_err().status();
        assert_eq!(status(parse_body(&headers(Some("application/json")), b"")), 400);
        assert_eq!(status(parse_body(&headers(Some("application/json")), b"{")), 400);
        assert_eq!(status(parse_body(&headers(Some("text/plain")), b"x")), 415);
        assert_eq!(status(parse_body(&headers(None), b"x")), 415);
    }

    #[test]
    fn a_repeated_query_name_reads_as_absent() {
        let query = parse_query(Some("client_id=a&client_id=b&scope=read"));
        assert_eq!(string_value(&query, "client_id"), "");
        assert_eq!(string_value(&query, "scope"), "read");
        assert_eq!(string_value(&parse_query(None), "scope"), "");
    }

    #[test]
    fn the_issuer_is_the_configured_origin_or_the_request_origin() {
        let mut meta = RequestMeta::new(&HeaderMap::new(), &Extensions::new());
        assert_eq!(issuer_origin(None, &meta), "http://localhost:3001");
        meta.host = Some("api.local".to_string());
        meta.protocol = "https".to_string();
        assert_eq!(issuer_origin(None, &meta), "https://api.local");
        assert_eq!(
            issuer_origin(Some("https://api.trakwyn.com".to_string()), &meta),
            "https://api.trakwyn.com"
        );
    }

    #[test]
    fn the_limiter_key_puts_the_category_before_anything_variable() {
        let mut meta = RequestMeta::new(&HeaderMap::new(), &Extensions::new());
        assert_eq!(limiter_key(&meta, ""), "mcp-oauth:ip:unknown:");
        meta.user_agent = Some("agent".to_string());
        assert_eq!(limiter_key(&meta, "client"), "mcp-oauth:ip:agent:client");
        meta.ip = Some("203.0.113.7".to_string());
        assert_eq!(limiter_key(&meta, "client"), "mcp-oauth:ip:203.0.113.7:client");
    }
}
