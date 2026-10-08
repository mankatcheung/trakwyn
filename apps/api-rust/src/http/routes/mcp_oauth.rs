//! MCP OAuth authorization-server and protected-resource endpoints
//! (`apps/api`'s `mcpOAuth.routes.ts`). The route table only: parsing,
//! validation and redirect building live in `mcp_oauth_helpers`.
//!
//! There is no consent page here. `GET /oauth/authorize` redirects the
//! browser to the web app's own consent screen, which calls
//! `/oauth/authorize/approve` (JSON) with the signed-in cookie session.

// A handler's early exit is the finished `Response`; it is built once per
// request, so its size does not matter.
#![allow(clippy::result_large_err)]

use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::{RawQuery, State};
use axum::http::{Extensions, HeaderMap, StatusCode};
use axum::response::Response;
use axum::routing::{get, post};
use axum::Router;
use chrono::Utc;
use serde_json::{json, Map, Value};

use super::mcp_oauth_helpers::{
    build_code_redirect, build_error_redirect, error_response, internal_error, issuer_origin,
    json_response, limiter_key, no_store, parse_body, parse_query, redirect, string_value,
    validate_authorization_request, AuthorizationRequest, AuthorizationValidation, RequestMeta,
};
use crate::domain::mcp_oauth::McpOAuthScope;
use crate::domain::security_event::SecurityEventType;
use crate::http::constants::mcp_oauth_routes as paths;
use crate::http::container::Container;
use crate::infrastructure::auth::McpConsentSubject;
use crate::use_cases::constants::mcp_oauth;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::mcp_oauth::{
    CreateMcpOAuthAuthorizationCodeInput, ExchangeMcpOAuthAuthorizationCodeInput,
    RegisterMcpOAuthClientInput, RotateMcpOAuthRefreshTokenInput,
};
use crate::use_cases::ports::{CreateSecurityEventData, RateLimiter};

type Reply = Result<Response, Response>;

pub fn router<S: Clone + Send + Sync + 'static>(container: Arc<Container>) -> Router<S> {
    Router::new()
        .route(paths::PROTECTED_RESOURCE_METADATA, get(protected_resource_metadata))
        .route(paths::AUTHORIZATION_SERVER_METADATA, get(authorization_server_metadata))
        .route(paths::REGISTER, post(register))
        .route(paths::AUTHORIZE, get(authorize))
        .route(paths::AUTHORIZE_APPROVE, get(consent_details).post(approve))
        .route(paths::TOKEN, post(token))
        .route(paths::REVOKE, post(revoke))
        .with_state(container)
}

/// `{issuer}/.well-known/oauth-protected-resource`, the URL the `/mcp`
/// endpoint's `WWW-Authenticate` challenge points clients at.
pub fn protected_resource_metadata_url(container: &Container, headers: &HeaderMap) -> String {
    let meta = RequestMeta::new(headers, &Extensions::new());
    let origin = issuer_origin(container.config.auth.issuer_origin(), &meta);
    format!("{origin}{}", paths::PROTECTED_RESOURCE_METADATA)
}

fn settled(reply: Reply) -> Response {
    reply.unwrap_or_else(|response| response)
}

fn ok(body: &Value) -> Reply {
    Ok(json_response(StatusCode::OK, body))
}

fn fail<T>(cause: &dyn std::fmt::Debug) -> Result<T, Response> {
    Err(internal_error(cause))
}

fn origin_of(container: &Container, meta: &RequestMeta) -> String {
    issuer_origin(container.config.auth.issuer_origin(), meta)
}

/// `Err(429)` once the key has used up its window.
async fn allow(
    limiter: &Arc<dyn RateLimiter>,
    meta: &RequestMeta,
    suffix: &str,
) -> Result<(), Response> {
    if limiter.consume(&limiter_key(meta, suffix)).await {
        Ok(())
    } else {
        Err(error_response(StatusCode::TOO_MANY_REQUESTS, "rate_limited"))
    }
}

/// The consent endpoints are browser-only and only ever called by the
/// Trakwyn web app, so an exact Origin match is both possible and the
/// load-bearing CSRF defence here. It cannot be left to the global CORS
/// policy, which also allows every `*.vercel.app` and extension origin with
/// credentials: fine for the API at large, not for an endpoint whose
/// response body carries an authorization code.
fn same_site_as_web_app(container: &Container, meta: &RequestMeta) -> Result<(), Response> {
    if meta.origin() == Some(container.services.web_app_origin.as_str()) {
        Ok(())
    } else {
        Err(error_response(StatusCode::FORBIDDEN, "invalid_request"))
    }
}

/// The signed-in user, or the 401 the consent endpoints answer with. Goes
/// through `AuthenticateRequestUseCase` rather than verifying the JWT directly
/// so that a session revoked by logout, "sign out other sessions", a password
/// reset or refresh-token reuse cannot still authorize a client.
async fn signed_in_user(container: &Container, meta: &RequestMeta) -> Result<String, Response> {
    let user = match meta.access_cookie() {
        Some(token) => container.authenticate_request_use_case().execute(token).await,
        None => None,
    };
    user.map(|user| user.sub)
        .ok_or_else(|| error_response(StatusCode::UNAUTHORIZED, "login_required"))
}

async fn validated(
    container: &Container,
    request: &AuthorizationRequest,
) -> Result<AuthorizationValidation, Response> {
    match validate_authorization_request(container.mcp_oauth_client_repository.as_ref(), request)
        .await
    {
        Ok(validation) => Ok(validation),
        Err(err) => fail(&err),
    }
}

fn consent_subject<'a>(
    user_id: &'a str,
    request: &'a AuthorizationRequest,
    scope: McpOAuthScope,
) -> McpConsentSubject<'a> {
    McpConsentSubject {
        user_id,
        client_id: &request.client_id,
        redirect_uri: &request.redirect_uri,
        scope: scope.as_str(),
        code_challenge: &request.code_challenge,
    }
}

async fn record_security_event(
    container: &Container,
    user_id: &str,
    event_type: SecurityEventType,
    meta: &RequestMeta,
) -> DomainResult<()> {
    container
        .security_event_repository
        .create(CreateSecurityEventData {
            id: (container.generate_id)(),
            user_id: user_id.to_string(),
            event_type,
            ip_address: meta.ip.clone(),
            user_agent: meta.user_agent.clone().filter(|agent| !agent.is_empty()),
        })
        .await
        .map(|_| ())
}

fn scopes() -> Value {
    json!(paths::SCOPES)
}

async fn protected_resource_metadata(
    State(container): State<Arc<Container>>,
    headers: HeaderMap,
    extensions: Extensions,
) -> Response {
    let origin = origin_of(&container, &RequestMeta::new(&headers, &extensions));
    settled(ok(&json!({
        "resource": format!("{origin}{}", mcp_oauth::RESOURCE),
        "authorization_servers": [origin],
        "scopes_supported": scopes(),
        "bearer_methods_supported": ["header"],
    })))
}

async fn authorization_server_metadata(
    State(container): State<Arc<Container>>,
    headers: HeaderMap,
    extensions: Extensions,
) -> Response {
    let origin = origin_of(&container, &RequestMeta::new(&headers, &extensions));
    settled(ok(&json!({
        "issuer": origin,
        "authorization_endpoint": format!("{origin}{}", paths::AUTHORIZE),
        "token_endpoint": format!("{origin}{}", paths::TOKEN),
        "revocation_endpoint": format!("{origin}{}", paths::REVOKE),
        "registration_endpoint": format!("{origin}{}", paths::REGISTER),
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "scopes_supported": scopes(),
    })))
}

async fn register(
    State(container): State<Arc<Container>>,
    headers: HeaderMap,
    extensions: Extensions,
    body: Bytes,
) -> Response {
    settled(register_client(&container, &headers, &extensions, &body).await)
}

async fn register_client(
    container: &Container,
    headers: &HeaderMap,
    extensions: &Extensions,
    body: &[u8],
) -> Reply {
    let body = parse_body(headers, body)?;
    let meta = RequestMeta::new(headers, extensions);
    allow(&container.services.rate_limiters.mcp_oauth_registration, &meta, "").await?;

    let redirect_uris = match body.get("redirect_uris") {
        Some(Value::Array(uris)) => {
            uris.iter().filter_map(Value::as_str).map(str::to_string).collect()
        }
        _ => Vec::new(),
    };
    let input = RegisterMcpOAuthClientInput {
        name: string_value(&body, "client_name").to_string(),
        redirect_uris,
    };
    // Any failure, validation or storage, is reported as bad metadata.
    let Ok(client) = container.register_mcp_oauth_client_use_case().execute(input).await else {
        return Ok(error_response(StatusCode::BAD_REQUEST, "invalid_client_metadata"));
    };
    Ok(no_store(json_response(
        StatusCode::CREATED,
        &json!({
            "client_id": client.id,
            "client_name": client.name,
            "redirect_uris": client.redirect_uris,
            "grant_types": ["authorization_code"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
        }),
    )))
}

async fn authorize(
    State(container): State<Arc<Container>>,
    headers: HeaderMap,
    extensions: Extensions,
    RawQuery(query): RawQuery,
) -> Response {
    let meta = RequestMeta::new(&headers, &extensions);
    settled(begin_authorization(&container, &meta, &parse_query(query.as_deref())).await)
}

async fn begin_authorization(
    container: &Container,
    meta: &RequestMeta,
    query: &Map<String, Value>,
) -> Reply {
    let request = AuthorizationRequest::from_map(query);
    allow(&container.services.rate_limiters.mcp_oauth_authorization, meta, &request.client_id)
        .await?;
    let scope = match validated(container, &request).await? {
        AuthorizationValidation::Valid { scope, .. } => scope,
        AuthorizationValidation::Invalid { error, redirectable } => {
            // Only once the client and its redirect URI are known-good may an
            // error travel back to the client; before that, reporting to an
            // unverified redirect_uri would make this endpoint an open
            // redirect (RFC 6749 s4.1.2.1).
            if redirectable {
                return match build_error_redirect(&request, error) {
                    Some(location) => Ok(redirect(&location)),
                    None => fail(&"registered redirect_uri is not a URL"),
                };
            }
            return Ok(error_response(StatusCode::BAD_REQUEST, error));
        }
    };

    // The resolved scope, not what was asked for: the consent screen shows
    // what would actually be granted.
    let query = form_urlencoded::Serializer::new(String::new())
        .append_pair("client_id", &request.client_id)
        .append_pair("redirect_uri", &request.redirect_uri)
        .append_pair("response_type", &request.response_type)
        .append_pair("scope", scope.as_str())
        .append_pair("state", request.state.as_deref().unwrap_or_default())
        .append_pair("code_challenge", &request.code_challenge)
        .append_pair("code_challenge_method", &request.code_challenge_method)
        .finish();
    Ok(redirect(&format!("{}/oauth/authorize?{query}", container.services.web_app_origin)))
}

/// What the consent screen shows, plus the token its decision must carry.
async fn consent_details(
    State(container): State<Arc<Container>>,
    headers: HeaderMap,
    extensions: Extensions,
    RawQuery(query): RawQuery,
) -> Response {
    let meta = RequestMeta::new(&headers, &extensions);
    settled(show_consent(&container, &meta, &parse_query(query.as_deref())).await)
}

async fn show_consent(
    container: &Container,
    meta: &RequestMeta,
    query: &Map<String, Value>,
) -> Reply {
    same_site_as_web_app(container, meta)?;
    allow(&container.services.rate_limiters.mcp_oauth_authorization, meta, "").await?;
    let user_id = signed_in_user(container, meta).await?;

    let request = AuthorizationRequest::from_map(query);
    let (client_name, scope) = match validated(container, &request).await? {
        AuthorizationValidation::Valid { client_name, scope } => (client_name, scope),
        AuthorizationValidation::Invalid { error, .. } => {
            return Ok(error_response(StatusCode::BAD_REQUEST, error));
        }
    };

    let consent_token = container
        .services
        .mcp_oauth_consent_service
        .issue(consent_subject(&user_id, &request, scope));
    Ok(no_store(json_response(
        StatusCode::OK,
        &json!({ "client_name": client_name, "scope": scope.as_str(), "consent_token": consent_token }),
    )))
}

async fn approve(
    State(container): State<Arc<Container>>,
    headers: HeaderMap,
    extensions: Extensions,
    body: Bytes,
) -> Response {
    settled(decide(&container, &headers, &extensions, &body).await)
}

async fn decide(
    container: &Container,
    headers: &HeaderMap,
    extensions: &Extensions,
    body: &[u8],
) -> Reply {
    let body = parse_body(headers, body)?;
    let meta = RequestMeta::new(headers, extensions);
    same_site_as_web_app(container, &meta)?;
    allow(&container.services.rate_limiters.mcp_oauth_authorization, &meta, "").await?;
    let user_id = signed_in_user(container, &meta).await?;

    let request = AuthorizationRequest::from_map(&body);
    let scope = match validated(container, &request).await? {
        AuthorizationValidation::Valid { scope, .. } => scope,
        AuthorizationValidation::Invalid { error, .. } => {
            return Ok(error_response(StatusCode::BAD_REQUEST, error));
        }
    };

    // Proof that this decision came from a consent screen this user was shown
    // for this exact request; see `McpOAuthConsentService`.
    let consent_service = &container.services.mcp_oauth_consent_service;
    if !consent_service
        .verify(string_value(&body, "consent_token"), consent_subject(&user_id, &request, scope))
    {
        return Ok(error_response(StatusCode::BAD_REQUEST, "invalid_request"));
    }

    if body.get("approved") != Some(&Value::Bool(true)) {
        let Some(location) = build_error_redirect(&request, "access_denied") else {
            return fail(&"registered redirect_uri is not a URL");
        };
        return ok(&json!({ "redirect_to": location }));
    }

    let issued = async {
        let result = container
            .create_mcp_oauth_authorization_code_use_case()
            .execute(CreateMcpOAuthAuthorizationCodeInput {
                client_id: request.client_id.clone(),
                user_id: user_id.clone(),
                redirect_uri: request.redirect_uri.clone(),
                scope,
                code_challenge: request.code_challenge.clone(),
            })
            .await?;
        record_security_event(container, &user_id, SecurityEventType::McpOauthAuthorized, &meta)
            .await?;
        Ok::<_, crate::use_cases::errors::DomainError>(result.raw_code)
    }
    .await;
    let location = issued.ok().and_then(|code| build_code_redirect(&request, &code));
    match location {
        Some(location) => {
            Ok(no_store(json_response(StatusCode::OK, &json!({ "redirect_to": location }))))
        }
        None => Ok(error_response(StatusCode::INTERNAL_SERVER_ERROR, "server_error")),
    }
}

fn seconds_until(expires_at: chrono::DateTime<Utc>) -> i64 {
    (expires_at.timestamp_millis() - Utc::now().timestamp_millis()).div_euclid(1000)
}

async fn token(
    State(container): State<Arc<Container>>,
    headers: HeaderMap,
    extensions: Extensions,
    body: Bytes,
) -> Response {
    settled(issue_tokens(&container, &headers, &extensions, &body).await)
}

async fn issue_tokens(
    container: &Container,
    headers: &HeaderMap,
    extensions: &Extensions,
    body: &[u8],
) -> Reply {
    let body = parse_body(headers, body)?;
    let meta = RequestMeta::new(headers, extensions);
    allow(&container.services.rate_limiters.mcp_oauth_token, &meta, "").await?;
    let grant_type = body.get("grant_type").and_then(Value::as_str);

    if grant_type == Some("refresh_token") {
        let result = container
            .rotate_mcp_oauth_refresh_token_use_case()
            .execute(RotateMcpOAuthRefreshTokenInput {
                refresh_token: string_value(&body, "refresh_token").to_string(),
                client_id: string_value(&body, "client_id").to_string(),
            })
            .await;
        let Some(result) = result.or_else(|err| fail(&err))? else {
            return Ok(error_response(StatusCode::BAD_REQUEST, "invalid_grant"));
        };
        if let Err(err) = record_security_event(
            container,
            &result.user_id,
            SecurityEventType::McpOauthTokenIssued,
            &meta,
        )
        .await
        {
            return fail(&err);
        }
        return Ok(no_store(json_response(
            StatusCode::OK,
            &json!({
                "access_token": result.access_token,
                "refresh_token": result.refresh_token,
                "token_type": "Bearer",
                "expires_in": seconds_until(result.access_token_expires_at),
            }),
        )));
    }

    if grant_type != Some("authorization_code") {
        return Ok(error_response(StatusCode::BAD_REQUEST, "unsupported_grant_type"));
    }

    let result = container
        .exchange_mcp_oauth_authorization_code_use_case()
        .execute(ExchangeMcpOAuthAuthorizationCodeInput {
            code: string_value(&body, "code").to_string(),
            client_id: string_value(&body, "client_id").to_string(),
            redirect_uri: string_value(&body, "redirect_uri").to_string(),
            code_verifier: string_value(&body, "code_verifier").to_string(),
        })
        .await;
    let Some(result) = result.or_else(|err| fail(&err))? else {
        return Ok(error_response(StatusCode::BAD_REQUEST, "invalid_grant"));
    };
    if let Err(err) = record_security_event(
        container,
        &result.token.user_id,
        SecurityEventType::McpOauthTokenIssued,
        &meta,
    )
    .await
    {
        return fail(&err);
    }
    Ok(no_store(json_response(
        StatusCode::OK,
        &json!({
            "access_token": result.access_token,
            "refresh_token": result.refresh_token,
            "token_type": "Bearer",
            "expires_in": seconds_until(result.token.expires_at),
            "scope": result.token.scope.as_str(),
        }),
    )))
}

async fn revoke(
    State(container): State<Arc<Container>>,
    headers: HeaderMap,
    extensions: Extensions,
    body: Bytes,
) -> Response {
    settled(revoke_grant(&container, &headers, &extensions, &body).await)
}

async fn revoke_grant(
    container: &Container,
    headers: &HeaderMap,
    extensions: &Extensions,
    body: &[u8],
) -> Reply {
    let body = parse_body(headers, body)?;
    let meta = RequestMeta::new(headers, extensions);
    allow(&container.services.rate_limiters.mcp_oauth_revocation, &meta, "").await?;

    let owner = container
        .revoke_mcp_oauth_grant_use_case()
        .execute(string_value(&body, "token"))
        .await
        .or_else(|err| fail(&err))?;
    if let Some(user_id) = owner {
        if let Err(err) = record_security_event(
            container,
            &user_id,
            SecurityEventType::McpOauthTokenRevoked,
            &meta,
        )
        .await
        {
            return fail(&err);
        }
    }
    // RFC 7009 s2.2: 200 whether or not the token existed, so this cannot be
    // used to probe which credentials are real.
    Ok(no_store(json_response(StatusCode::OK, &json!({}))))
}
