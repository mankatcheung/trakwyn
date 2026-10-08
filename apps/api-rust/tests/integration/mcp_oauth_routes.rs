//! The MCP OAuth authorization server end to end: discovery, dynamic client
//! registration, the consent hand-off, the code exchange with PKCE, refresh
//! rotation with reuse detection, and revocation.

use axum::body::Body;
use axum::http::header::{CONTENT_TYPE, COOKIE, LOCATION, ORIGIN};
use axum::http::{Request, StatusCode};
use serde_json::{json, Value};
use url::Url;

use trakwyn_api::domain::api_token::ApiTokenScope;

use crate::common::{seed_user, Response, TestApp};

const REDIRECT: &str = "http://localhost:6274/oauth/callback";
const VERIFIER: &str = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
/// S256 of `VERIFIER` (RFC 7636 appendix B).
const CHALLENGE: &str = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

fn web_origin(app: &TestApp) -> String {
    app.container.services.web_app_origin.clone()
}

fn get(path: &str) -> Request<Body> {
    Request::get(path).body(Body::empty()).unwrap()
}

fn post_json(path: &str, body: &Value) -> Request<Body> {
    Request::post(path)
        .header(CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn post_form(path: &str, pairs: &[(&str, &str)]) -> Request<Body> {
    let body = form_urlencoded::Serializer::new(String::new()).extend_pairs(pairs).finish();
    Request::post(path)
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(Body::from(body))
        .unwrap()
}

fn query(pairs: &[(&str, &str)]) -> String {
    form_urlencoded::Serializer::new(String::new()).extend_pairs(pairs).finish()
}

fn authorization_pairs<'a>(client_id: &'a str, scope: &'a str) -> Vec<(&'a str, &'a str)> {
    vec![
        ("client_id", client_id),
        ("redirect_uri", REDIRECT),
        ("response_type", "code"),
        ("scope", scope),
        ("state", "st 1"),
        ("code_challenge", CHALLENGE),
        ("code_challenge_method", "S256"),
    ]
}

/// The consent screen's two calls, made as the signed-in web app.
struct Browser<'a> {
    app: &'a TestApp,
    cookie: String,
}

impl<'a> Browser<'a> {
    fn consent_request(&self, pairs: &[(&str, &str)], origin: Option<&str>) -> Request<Body> {
        let mut request = Request::get(format!("/oauth/authorize/approve?{}", query(pairs)));
        if let Some(origin) = origin {
            request = request.header(ORIGIN, origin);
        }
        request
            .header(COOKIE, format!("trakwyn_access_token={}", self.cookie))
            .body(Body::empty())
            .unwrap()
    }

    async fn consent(&self, client_id: &str, scope: &str) -> Response {
        let origin = web_origin(self.app);
        let pairs = authorization_pairs(client_id, scope);
        self.app.send(self.consent_request(&pairs, Some(&origin))).await
    }

    fn decision_request(&self, body: &Value, origin: Option<&str>) -> Request<Body> {
        let mut request =
            Request::post("/oauth/authorize/approve").header(CONTENT_TYPE, "application/json");
        if let Some(origin) = origin {
            request = request.header(ORIGIN, origin);
        }
        request
            .header(COOKIE, format!("trakwyn_access_token={}", self.cookie))
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    fn decision_body(client_id: &str, scope: &str, consent_token: &str, approved: Value) -> Value {
        json!({
            "client_id": client_id,
            "redirect_uri": REDIRECT,
            "response_type": "code",
            "scope": scope,
            "state": "st 1",
            "code_challenge": CHALLENGE,
            "code_challenge_method": "S256",
            "consent_token": consent_token,
            "approved": approved,
        })
    }

    /// Consent and approve; the authorization code from the redirect.
    async fn authorize(&self, client_id: &str, scope: &str) -> String {
        let consent = self.consent(client_id, scope).await;
        assert_eq!(consent.status, StatusCode::OK, "{}", consent.body);
        let token = consent.body["consent_token"].as_str().unwrap();
        let body = Self::decision_body(client_id, scope, token, json!(true));
        let origin = web_origin(self.app);
        let decision = self.app.send(self.decision_request(&body, Some(&origin))).await;
        assert_eq!(decision.status, StatusCode::OK, "{}", decision.body);
        let redirect = Url::parse(decision.body["redirect_to"].as_str().unwrap()).unwrap();
        let param = |name: &str| {
            redirect.query_pairs().find(|(key, _)| key == name).map(|(_, value)| value.into_owned())
        };
        assert_eq!(param("state").as_deref(), Some("st 1"));
        param("code").unwrap()
    }
}

struct World {
    app: TestApp,
    cookie: String,
}

impl World {
    async fn start() -> Self {
        let app = TestApp::start().await;
        seed_user(&app.db, "owner").await;
        let cookie = app.access_token("owner");
        Self { app, cookie }
    }

    fn browser(&self) -> Browser<'_> {
        Browser { app: &self.app, cookie: self.cookie.clone() }
    }

    async fn register(&self) -> String {
        let response = self
            .app
            .send(post_json(
                "/oauth/register",
                &json!({ "client_name": "Claude Desktop", "redirect_uris": [REDIRECT] }),
            ))
            .await;
        assert_eq!(response.status, StatusCode::CREATED, "{}", response.body);
        response.body["client_id"].as_str().unwrap().to_string()
    }

    async fn exchange(&self, client_id: &str, code: &str, verifier: &str) -> Response {
        self.app
            .send(post_form(
                "/oauth/token",
                &[
                    ("grant_type", "authorization_code"),
                    ("code", code),
                    ("client_id", client_id),
                    ("redirect_uri", REDIRECT),
                    ("code_verifier", verifier),
                ],
            ))
            .await
    }

    async fn refresh(&self, client_id: &str, refresh_token: &str) -> Response {
        self.app
            .send(post_form(
                "/oauth/token",
                &[
                    ("grant_type", "refresh_token"),
                    ("refresh_token", refresh_token),
                    ("client_id", client_id),
                ],
            ))
            .await
    }

    /// Whether the MCP endpoint's authenticator accepts the token.
    async fn mcp_scope(&self, raw_token: &str) -> Option<ApiTokenScope> {
        self.app
            .container
            .authenticate_mcp_request_use_case()
            .execute(raw_token)
            .await
            .map(|result| result.scope)
    }

    /// Registers, authorizes and exchanges: `(client_id, access, refresh)`.
    async fn grant(&self, scope: &str) -> (String, String, String) {
        let client_id = self.register().await;
        let code = self.browser().authorize(&client_id, scope).await;
        let tokens = self.exchange(&client_id, &code, VERIFIER).await;
        assert_eq!(tokens.status, StatusCode::OK, "{}", tokens.body);
        (
            client_id,
            tokens.body["access_token"].as_str().unwrap().to_string(),
            tokens.body["refresh_token"].as_str().unwrap().to_string(),
        )
    }
}

async fn count_events(app: &TestApp, event_type: &str) -> i64 {
    sqlx::query_scalar(r#"SELECT count(*) FROM "SecurityEvent" WHERE "eventType" = $1"#)
        .bind(event_type)
        .fetch_one(app.db.pool())
        .await
        .unwrap()
}

#[tokio::test]
async fn publishes_the_discovery_documents() {
    let app = TestApp::start().await;

    let resource = app.send(get("/.well-known/oauth-protected-resource")).await;
    assert_eq!(resource.status, StatusCode::OK);
    assert_eq!(resource.body["resource"], "http://localhost:3001/mcp");
    assert_eq!(resource.body["authorization_servers"], json!(["http://localhost:3001"]));
    assert_eq!(resource.body["scopes_supported"], json!(["read", "full"]));
    assert_eq!(resource.body["bearer_methods_supported"], json!(["header"]));

    let server = app.send(get("/.well-known/oauth-authorization-server")).await;
    assert_eq!(server.body["issuer"], "http://localhost:3001");
    assert_eq!(server.body["authorization_endpoint"], "http://localhost:3001/oauth/authorize");
    assert_eq!(server.body["token_endpoint"], "http://localhost:3001/oauth/token");
    assert_eq!(server.body["revocation_endpoint"], "http://localhost:3001/oauth/revoke");
    assert_eq!(server.body["registration_endpoint"], "http://localhost:3001/oauth/register");
    assert_eq!(server.body["code_challenge_methods_supported"], json!(["S256"]));
    assert_eq!(
        server.body["grant_types_supported"],
        json!(["authorization_code", "refresh_token"])
    );
}

#[tokio::test]
async fn the_issuer_comes_from_the_request_only_when_api_origin_is_unset() {
    let app = TestApp::start().await;
    let request = Request::get("/.well-known/oauth-authorization-server")
        .header("host", "evil.example")
        .header("x-forwarded-proto", "https")
        .body(Body::empty())
        .unwrap();
    // Unconfigured (local dev): the request's own origin.
    assert_eq!(app.send(request).await.body["issuer"], "https://evil.example");
}

#[tokio::test]
async fn configured_api_origin_wins_over_the_host_header() {
    let mut config = crate::common::test_config();
    config.auth.api_origin = Some("https://api.trakwyn.com/".to_string());
    let app = TestApp::start_with(config).await;
    let request = Request::get("/.well-known/oauth-protected-resource")
        .header("host", "evil.example")
        .body(Body::empty())
        .unwrap();
    let response = app.send(request).await;
    assert_eq!(response.body["resource"], "https://api.trakwyn.com/mcp");
    assert_eq!(response.body["authorization_servers"], json!(["https://api.trakwyn.com"]));
}

mod registration {
    use super::*;

    #[tokio::test]
    async fn registers_a_public_client_and_never_lets_the_response_be_cached() {
        let world = World::start().await;
        let response = world
            .app
            .send(post_json(
                "/oauth/register",
                &json!({ "client_name": " Claude ", "redirect_uris": [REDIRECT, REDIRECT] }),
            ))
            .await;

        assert_eq!(response.status, StatusCode::CREATED);
        assert_eq!(response.headers["cache-control"], "no-store");
        assert_eq!(response.headers["pragma"], "no-cache");
        assert!(response.body["client_id"].as_str().unwrap().starts_with("trakwyn_mcp_client_"));
        assert_eq!(response.body["client_name"], "Claude");
        assert_eq!(response.body["redirect_uris"], json!([REDIRECT]));
        assert_eq!(response.body["grant_types"], json!(["authorization_code"]));
        assert_eq!(response.body["token_endpoint_auth_method"], "none");
    }

    #[tokio::test]
    async fn refuses_bad_metadata() {
        let world = World::start().await;
        for body in [
            json!({ "client_name": "x", "redirect_uris": ["http://evil.example/cb"] }),
            json!({ "client_name": "x", "redirect_uris": [] }),
            json!({ "client_name": "x" }),
            json!({ "client_name": "", "redirect_uris": [REDIRECT] }),
            json!({ "client_name": "x", "redirect_uris": "http://localhost/cb" }),
            json!([]),
        ] {
            let response = world.app.send(post_json("/oauth/register", &body)).await;
            assert_eq!(response.status, StatusCode::BAD_REQUEST, "{body}");
            assert_eq!(response.body, json!({ "error": "invalid_client_metadata" }));
        }
    }

    #[tokio::test]
    async fn refuses_a_body_fastify_would_refuse() {
        let world = World::start().await;
        let text = Request::post("/oauth/register")
            .header(CONTENT_TYPE, "text/plain")
            .body(Body::from("x"))
            .unwrap();
        assert_eq!(world.app.send(text).await.status, StatusCode::UNSUPPORTED_MEDIA_TYPE);
        let broken = Request::post("/oauth/register")
            .header(CONTENT_TYPE, "application/json")
            .body(Body::from("{"))
            .unwrap();
        assert_eq!(world.app.send(broken).await.status, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn rate_limits_registration_per_caller() {
        let world = World::start().await;
        let body = json!({ "client_name": "x", "redirect_uris": [REDIRECT] });
        for _ in 0..10 {
            let response = world.app.send(post_json("/oauth/register", &body)).await;
            assert_eq!(response.status, StatusCode::CREATED);
        }
        let limited = world.app.send(post_json("/oauth/register", &body)).await;
        assert_eq!(limited.status, StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(limited.body, json!({ "error": "rate_limited" }));
    }
}

mod authorize {
    use super::*;

    fn location(response: &Response) -> Url {
        Url::parse(response.headers[LOCATION].to_str().unwrap()).unwrap()
    }

    #[tokio::test]
    async fn hands_a_valid_request_to_the_web_apps_consent_screen_with_the_resolved_scope() {
        let world = World::start().await;
        let client_id = world.register().await;
        let pairs = authorization_pairs(&client_id, "read full");

        let response = world.app.send(get(&format!("/oauth/authorize?{}", query(&pairs)))).await;

        assert_eq!(response.status, StatusCode::FOUND);
        let target = location(&response);
        assert_eq!(target.origin(), Url::parse(&web_origin(&world.app)).unwrap().origin());
        assert_eq!(target.path(), "/oauth/authorize");
        let param = |name: &str| {
            target.query_pairs().find(|(key, _)| key == name).map(|(_, v)| v.into_owned()).unwrap()
        };
        assert_eq!(param("scope"), "full");
        assert_eq!(param("state"), "st 1");
        assert_eq!(param("client_id"), client_id);
        assert_eq!(param("code_challenge"), CHALLENGE);
    }

    #[tokio::test]
    async fn never_reports_to_an_unverified_redirect_uri() {
        let world = World::start().await;
        let client_id = world.register().await;

        let mut pairs = authorization_pairs(&client_id, "read");
        pairs[1] = ("redirect_uri", "https://evil.example/cb");
        let unknown_uri = world.app.send(get(&format!("/oauth/authorize?{}", query(&pairs)))).await;
        assert_eq!(unknown_uri.status, StatusCode::BAD_REQUEST);
        assert_eq!(unknown_uri.body, json!({ "error": "invalid_client" }));

        let pairs = authorization_pairs("trakwyn_mcp_client_nope", "read");
        let unknown_client =
            world.app.send(get(&format!("/oauth/authorize?{}", query(&pairs)))).await;
        assert_eq!(unknown_client.body, json!({ "error": "invalid_client" }));

        let missing = world.app.send(get("/oauth/authorize")).await;
        assert_eq!(missing.body, json!({ "error": "invalid_request" }));
    }

    #[tokio::test]
    async fn reports_other_errors_to_the_registered_redirect_uri() {
        let world = World::start().await;
        let client_id = world.register().await;
        let cases = [
            ("response_type", "token", "unsupported_response_type"),
            ("code_challenge_method", "plain", "invalid_request"),
            ("code_challenge", "", "invalid_request"),
            ("scope", "admin", "invalid_scope"),
        ];
        for (name, value, error) in cases {
            let mut pairs = authorization_pairs(&client_id, "read");
            pairs.retain(|(key, _)| *key != name);
            pairs.push((name, value));
            let response =
                world.app.send(get(&format!("/oauth/authorize?{}", query(&pairs)))).await;
            assert_eq!(response.status, StatusCode::FOUND, "{name}");
            let target = location(&response);
            assert_eq!(
                format!("{}{}", target.origin().ascii_serialization(), target.path()),
                REDIRECT
            );
            let param = |key: &str| {
                target.query_pairs().find(|(k, _)| k == key).map(|(_, v)| v.into_owned())
            };
            assert_eq!(param("error").as_deref(), Some(error), "{name}");
            assert_eq!(param("state").as_deref(), Some("st 1"));
        }
    }
}

mod consent {
    use super::*;

    #[tokio::test]
    async fn shows_the_client_name_and_issues_a_consent_token() {
        let world = World::start().await;
        let client_id = world.register().await;

        let response = world.browser().consent(&client_id, "read full").await;

        assert_eq!(response.status, StatusCode::OK);
        assert_eq!(response.headers["cache-control"], "no-store");
        assert_eq!(response.body["client_name"], "Claude Desktop");
        assert_eq!(response.body["scope"], "full");
        assert!(response.body["consent_token"].as_str().unwrap().contains('.'));
    }

    #[tokio::test]
    async fn refuses_another_origin_or_none_at_all() {
        let world = World::start().await;
        let client_id = world.register().await;
        let browser = world.browser();
        let pairs = authorization_pairs(&client_id, "read");

        for origin in [Some("https://evil.example"), None] {
            let response = world.app.send(browser.consent_request(&pairs, origin)).await;
            assert_eq!(response.status, StatusCode::FORBIDDEN);
            assert_eq!(response.body, json!({ "error": "invalid_request" }));
        }

        let body = Browser::decision_body(&client_id, "read", "x.y", json!(true));
        for origin in [Some("https://evil.example"), None] {
            let response = world.app.send(browser.decision_request(&body, origin)).await;
            assert_eq!(response.status, StatusCode::FORBIDDEN);
        }
        assert_eq!(count_events(&world.app, "mcp_oauth_authorized").await, 0);
    }

    #[tokio::test]
    async fn refuses_a_visitor_with_no_session_or_a_dead_one() {
        let world = World::start().await;
        let client_id = world.register().await;
        let pairs = authorization_pairs(&client_id, "read");
        let origin = web_origin(&world.app);

        let anonymous = Request::get(format!("/oauth/authorize/approve?{}", query(&pairs)))
            .header(ORIGIN, &origin)
            .body(Body::empty())
            .unwrap();
        let response = world.app.send(anonymous).await;
        assert_eq!(response.status, StatusCode::UNAUTHORIZED);
        assert_eq!(response.body, json!({ "error": "login_required" }));

        // A session revoked since the cookie was minted cannot authorize.
        world.app.container.session_blocklist.revoke("sid-owner").await;
        let revoked = world.browser().consent(&client_id, "read").await;
        assert_eq!(revoked.status, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn refuses_a_decision_without_a_consent_token_or_with_one_for_another_request() {
        let world = World::start().await;
        let client_id = world.register().await;
        let other_client = world.register().await;
        let browser = world.browser();
        let origin = web_origin(&world.app);

        let none = Browser::decision_body(&client_id, "read", "", json!(true));
        let response = world.app.send(browser.decision_request(&none, Some(&origin))).await;
        assert_eq!(response.status, StatusCode::BAD_REQUEST);
        assert_eq!(response.body, json!({ "error": "invalid_request" }));

        let token = browser.consent(&other_client, "read").await.body["consent_token"]
            .as_str()
            .unwrap()
            .to_string();
        let swapped = Browser::decision_body(&client_id, "read", &token, json!(true));
        let response = world.app.send(browser.decision_request(&swapped, Some(&origin))).await;
        assert_eq!(response.status, StatusCode::BAD_REQUEST);

        // Consent to `read` does not buy `full`.
        let token = browser.consent(&client_id, "read").await.body["consent_token"]
            .as_str()
            .unwrap()
            .to_string();
        let widened = Browser::decision_body(&client_id, "full", &token, json!(true));
        let response = world.app.send(browser.decision_request(&widened, Some(&origin))).await;
        assert_eq!(response.status, StatusCode::BAD_REQUEST);
        assert_eq!(count_events(&world.app, "mcp_oauth_authorized").await, 0);
    }

    #[tokio::test]
    async fn a_refusal_redirects_to_the_client_with_access_denied() {
        let world = World::start().await;
        let client_id = world.register().await;
        let browser = world.browser();
        let origin = web_origin(&world.app);
        let token = browser.consent(&client_id, "read").await.body["consent_token"]
            .as_str()
            .unwrap()
            .to_string();

        // Anything but the boolean `true` is a refusal.
        for approved in [json!(false), json!("true"), json!(1), Value::Null] {
            let body = Browser::decision_body(&client_id, "read", &token, approved);
            let response = world.app.send(browser.decision_request(&body, Some(&origin))).await;
            assert_eq!(response.status, StatusCode::OK);
            assert_eq!(
                response.body["redirect_to"],
                format!("{REDIRECT}?error=access_denied&state=st+1")
            );
        }
        assert_eq!(count_events(&world.app, "mcp_oauth_authorized").await, 0);
        let codes: i64 = sqlx::query_scalar(r#"SELECT count(*) FROM "McpOAuthAuthorizationCode""#)
            .fetch_one(world.app.db.pool())
            .await
            .unwrap();
        assert_eq!(codes, 0);
    }
}

mod tokens {
    use super::*;

    #[tokio::test]
    async fn runs_the_whole_flow_from_registration_to_revocation() {
        let world = World::start().await;
        let client_id = world.register().await;

        // Authorize (signed in via the access cookie) and approve.
        let code = world.browser().authorize(&client_id, "read").await;
        assert!(code.starts_with("trakwyn_mcp_code_"));
        assert_eq!(count_events(&world.app, "mcp_oauth_authorized").await, 1);

        // Exchange the code with the PKCE verifier.
        let tokens = world.exchange(&client_id, &code, VERIFIER).await;
        assert_eq!(tokens.status, StatusCode::OK, "{}", tokens.body);
        assert_eq!(tokens.headers["cache-control"], "no-store");
        assert_eq!(tokens.headers["pragma"], "no-cache");
        assert_eq!(tokens.body["token_type"], "Bearer");
        assert_eq!(tokens.body["scope"], "read");
        let expires_in = tokens.body["expires_in"].as_i64().unwrap();
        assert!((3598..=3600).contains(&expires_in), "{expires_in}");
        let access = tokens.body["access_token"].as_str().unwrap().to_string();
        let refresh = tokens.body["refresh_token"].as_str().unwrap().to_string();
        assert!(access.starts_with("trakwyn_mcp_"));
        assert!(refresh.starts_with("trakwyn_mcp_refresh_"));
        assert_eq!(count_events(&world.app, "mcp_oauth_token_issued").await, 1);

        // A token-protected check: the MCP authenticator accepts it, with the consented scope.
        assert_eq!(world.mcp_scope(&access).await, Some(ApiTokenScope::Read));

        // Refresh: a new pair, the old refresh token spent.
        let rotated = world.refresh(&client_id, &refresh).await;
        assert_eq!(rotated.status, StatusCode::OK, "{}", rotated.body);
        let new_access = rotated.body["access_token"].as_str().unwrap().to_string();
        let new_refresh = rotated.body["refresh_token"].as_str().unwrap().to_string();
        assert_ne!(new_refresh, refresh);
        assert_eq!(world.mcp_scope(&new_access).await, Some(ApiTokenScope::Read));

        // Reuse of the rotated refresh token revokes the whole family.
        let replay = world.refresh(&client_id, &refresh).await;
        assert_eq!(replay.status, StatusCode::BAD_REQUEST);
        assert_eq!(replay.body, json!({ "error": "invalid_grant" }));
        assert_eq!(count_events(&world.app, "mcp_oauth_refresh_reuse_detected").await, 1);
        assert_eq!(world.mcp_scope(&access).await, None);
        assert_eq!(world.mcp_scope(&new_access).await, None);
        let after_burn = world.refresh(&client_id, &new_refresh).await;
        assert_eq!(after_burn.status, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn a_full_scope_grant_carries_full_scope_to_mcp() {
        let world = World::start().await;
        let (_, access, _) = world.grant("read full").await;
        assert_eq!(world.mcp_scope(&access).await, Some(ApiTokenScope::Full));
    }

    #[tokio::test]
    async fn the_token_endpoint_accepts_json_as_well_as_forms() {
        let world = World::start().await;
        let client_id = world.register().await;
        let code = world.browser().authorize(&client_id, "read").await;
        let body = json!({
            "grant_type": "authorization_code", "code": code, "client_id": client_id,
            "redirect_uri": REDIRECT, "code_verifier": VERIFIER,
        });
        let response = world.app.send(post_json("/oauth/token", &body)).await;
        assert_eq!(response.status, StatusCode::OK, "{}", response.body);
    }

    #[tokio::test]
    async fn refuses_a_verifier_that_does_not_match_and_leaves_the_code_usable() {
        let world = World::start().await;
        let client_id = world.register().await;
        let code = world.browser().authorize(&client_id, "read").await;

        let wrong = "x".repeat(43);
        let refused = world.exchange(&client_id, &code, &wrong).await;
        assert_eq!(refused.status, StatusCode::BAD_REQUEST);
        assert_eq!(refused.body, json!({ "error": "invalid_grant" }));
        let malformed = world.exchange(&client_id, &code, "short").await;
        assert_eq!(malformed.body, json!({ "error": "invalid_grant" }));

        assert_eq!(world.exchange(&client_id, &code, VERIFIER).await.status, StatusCode::OK);
    }

    #[tokio::test]
    async fn a_replayed_code_revokes_what_the_first_exchange_produced() {
        let world = World::start().await;
        let client_id = world.register().await;
        let code = world.browser().authorize(&client_id, "read").await;
        let first = world.exchange(&client_id, &code, VERIFIER).await;
        let access = first.body["access_token"].as_str().unwrap().to_string();
        let refresh = first.body["refresh_token"].as_str().unwrap().to_string();
        assert_eq!(world.mcp_scope(&access).await, Some(ApiTokenScope::Read));

        let replay = world.exchange(&client_id, &code, VERIFIER).await;

        assert_eq!(replay.status, StatusCode::BAD_REQUEST);
        assert_eq!(replay.body, json!({ "error": "invalid_grant" }));
        assert_eq!(count_events(&world.app, "mcp_oauth_code_reuse_detected").await, 1);
        assert_eq!(world.mcp_scope(&access).await, None);
        assert_eq!(world.refresh(&client_id, &refresh).await.status, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn refuses_an_exchange_for_another_redirect_uri_client_or_an_expired_code() {
        let world = World::start().await;
        let client_id = world.register().await;
        let other_client = world.register().await;
        let code = world.browser().authorize(&client_id, "read").await;

        let other_uri = world
            .app
            .send(post_form(
                "/oauth/token",
                &[
                    ("grant_type", "authorization_code"),
                    ("code", &code),
                    ("client_id", &client_id),
                    ("redirect_uri", "http://localhost:6274/other"),
                    ("code_verifier", VERIFIER),
                ],
            ))
            .await;
        assert_eq!(other_uri.body, json!({ "error": "invalid_grant" }));
        let stolen = world.exchange(&other_client, &code, VERIFIER).await;
        assert_eq!(stolen.body, json!({ "error": "invalid_grant" }));

        sqlx::query(
            r#"UPDATE "McpOAuthAuthorizationCode" SET "expiresAt" = now() - interval '1 second'"#,
        )
        .execute(world.app.db.pool())
        .await
        .unwrap();
        let expired = world.exchange(&client_id, &code, VERIFIER).await;
        assert_eq!(expired.body, json!({ "error": "invalid_grant" }));
    }

    #[tokio::test]
    async fn a_refresh_token_belongs_to_the_client_it_was_issued_to() {
        let world = World::start().await;
        let (_, _, refresh) = world.grant("read").await;
        let other_client = world.register().await;

        let response = world.refresh(&other_client, &refresh).await;

        assert_eq!(response.status, StatusCode::BAD_REQUEST);
        assert_eq!(response.body, json!({ "error": "invalid_grant" }));
    }

    #[tokio::test]
    async fn refuses_an_unsupported_or_missing_grant_type() {
        let world = World::start().await;
        for pairs in [vec![("grant_type", "password")], vec![]] {
            let response = world.app.send(post_form("/oauth/token", &pairs)).await;
            assert_eq!(response.status, StatusCode::BAD_REQUEST);
            assert_eq!(response.body, json!({ "error": "unsupported_grant_type" }));
        }
    }

    #[tokio::test]
    async fn rate_limits_the_token_endpoint() {
        let world = World::start().await;
        for _ in 0..20 {
            let response = world.app.send(post_form("/oauth/token", &[])).await;
            assert_eq!(response.status, StatusCode::BAD_REQUEST);
        }
        let limited = world.app.send(post_form("/oauth/token", &[])).await;
        assert_eq!(limited.status, StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(limited.body, json!({ "error": "rate_limited" }));
    }
}

mod revocation {
    use super::*;

    async fn revoke(world: &World, token: &str) -> Response {
        world.app.send(post_form("/oauth/revoke", &[("token", token)])).await
    }

    #[tokio::test]
    async fn an_access_token_revokes_the_whole_grant() {
        let world = World::start().await;
        let (client_id, access, refresh) = world.grant("read").await;

        let response = revoke(&world, &access).await;

        assert_eq!(response.status, StatusCode::OK);
        assert_eq!(response.body, json!({}));
        assert_eq!(response.headers["cache-control"], "no-store");
        assert_eq!(world.mcp_scope(&access).await, None);
        assert_eq!(world.refresh(&client_id, &refresh).await.status, StatusCode::BAD_REQUEST);
        assert_eq!(count_events(&world.app, "mcp_oauth_token_revoked").await, 1);
    }

    #[tokio::test]
    async fn a_refresh_token_revokes_the_whole_grant() {
        let world = World::start().await;
        let (_, access, refresh) = world.grant("read").await;

        assert_eq!(revoke(&world, &refresh).await.status, StatusCode::OK);

        assert_eq!(world.mcp_scope(&access).await, None);
    }

    #[tokio::test]
    async fn answers_ok_for_an_unknown_token_without_recording_anything() {
        let world = World::start().await;
        for token in ["trakwyn_mcp_unknown", "trakwyn_mcp_refresh_unknown", "garbage", ""] {
            let response = revoke(&world, token).await;
            assert_eq!(response.status, StatusCode::OK);
            assert_eq!(response.body, json!({}));
        }
        assert_eq!(count_events(&world.app, "mcp_oauth_token_revoked").await, 0);
    }
}
