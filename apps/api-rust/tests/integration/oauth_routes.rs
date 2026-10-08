//! The OAuth sign-in routes end to end, through the fake provider: start,
//! the stand-in consent screen, and the callback, for web, mobile and the
//! Chrome and Safari extension flows, plus every failure branch.

use axum::body::Body;
use axum::http::header::LOCATION;
use axum::http::Request;
use base64::Engine;
use serde_json::json;
use url::Url;

use trakwyn_api::config::auth::{OAuthClientCredentials, OAuthProviderMode};
use trakwyn_api::infrastructure::auth::create_pkce_pair;

use crate::auth_support::*;
use crate::common::{seed_user, test_config, Response, TestApp};

const HOST: &str = "api.test";
const EXTENSION_ID: &str = "abcdefghijklmnopabcdefghijklmnop";
const OTHER_EXTENSION_ID: &str = "ponmlkjihgfedcbaponmlkjihgfedcba";
const STATE_COOKIE: &str = "trakwyn_oauth_state";
const WEB: &str = "http://localhost:3000";
const EXCHANGE: &str = "mutation($code: String!, $codeVerifier: String!) {
    exchangeMobileOAuthCode(code: $code, codeVerifier: $codeVerifier) {
        accessToken refreshToken
    }
}";

fn credentials() -> Option<OAuthClientCredentials> {
    Some(OAuthClientCredentials { client_id: "id".into(), client_secret: "secret".into() })
}

async fn app_with(mode: OAuthProviderMode, configured: bool) -> TestApp {
    let mut config = test_config();
    config.auth.oauth_provider_mode = mode;
    config.auth.extension_oauth_ids = Some(EXTENSION_ID.to_string());
    if configured {
        config.auth.google_oauth = credentials();
        config.auth.github_oauth = credentials();
    }
    TestApp::start_with(config).await
}

async fn app() -> TestApp {
    app_with(OAuthProviderMode::Fake, true).await
}

async fn get(app: &TestApp, path: &str, headers: &[(&str, String)]) -> Response {
    let mut builder = Request::get(path).header("host", HOST);
    for (name, value) in headers {
        builder = builder.header(*name, value);
    }
    app.send(builder.body(Body::empty()).unwrap()).await
}

fn location(response: &Response) -> String {
    response.headers.get(LOCATION).expect("a redirect").to_str().unwrap().to_string()
}

fn url_of(location: &str) -> Url {
    Url::parse("http://api.test").unwrap().join(location).unwrap()
}

fn param(url: &Url, name: &str) -> Option<String> {
    url.query_pairs().find(|(key, _)| key == name).map(|(_, value)| value.into_owned())
}

fn path_and_query(url: &Url) -> String {
    format!("{}?{}", url.path(), url.query().unwrap_or_default())
}

async fn count(app: &TestApp, table: &str) -> i64 {
    sqlx::query_scalar(&format!(r#"SELECT count(*) FROM "{table}""#))
        .fetch_one(app.db.pool())
        .await
        .unwrap()
}

/// Runs start and the consent screen; returns the callback path and the
/// state cookie header the browser would carry back.
async fn through_provider(
    app: &TestApp,
    start_query: &str,
    start_headers: &[(&str, String)],
    consent_extra: &str,
) -> (String, (&'static str, String)) {
    let start = get(app, &format!("/auth/oauth/google/start{start_query}"), start_headers).await;
    assert_eq!(start.status, 302, "start: {}", start.body);
    let state_cookie = cookie_value(&start, STATE_COOKIE).expect("the state cookie");
    let consent = url_of(&location(&start));
    let consent_path = format!("{}{consent_extra}", path_and_query(&consent));
    let back = get(app, &consent_path, &[]).await;
    assert_eq!(back.status, 302, "consent: {}", back.body);
    (path_and_query(&url_of(&location(&back))), cookie(STATE_COOKIE, &state_cookie))
}

async fn sign_in(app: &TestApp, start_query: &str, consent_extra: &str) -> Response {
    let (callback, cookie) = through_provider(app, start_query, &[], consent_extra).await;
    get(app, &callback, &[cookie]).await
}

fn handoff_query(platform: &str, challenge: &str) -> String {
    format!("?platform={platform}&codeChallenge={challenge}")
}

async fn redeem(app: &TestApp, target: &str, verifier: &str) -> Response {
    let code = param(&Url::parse(target).unwrap(), "code").expect("a handoff code");
    post(app, EXCHANGE, json!({ "code": code, "codeVerifier": verifier }), &[]).await
}

#[tokio::test]
async fn start_redirects_to_the_provider_with_a_signed_state_and_a_nonce_cookie() {
    let app = app().await;
    let response = get(&app, "/auth/oauth/google/start", &[]).await;
    assert_eq!(response.status, 302);
    let consent = url_of(&location(&response));
    assert_eq!(consent.path(), "/auth/oauth/fake-provider/authorize");
    assert_eq!(param(&consent, "provider").as_deref(), Some("google"));
    assert!(param(&consent, "state").unwrap().contains('.'));

    let cookies = set_cookies(&response);
    assert_eq!(cookies.len(), 1);
    let cookie = &cookies[0];
    assert!(cookie.starts_with("trakwyn_oauth_state="), "{cookie}");
    assert!(cookie.ends_with("; Max-Age=300; Path=/; HttpOnly; SameSite=Lax"), "{cookie}");
    assert!(!cookie.contains("Domain"));
}

#[tokio::test]
async fn the_state_cookie_is_secure_in_production() {
    let mut config = test_config();
    config.node_env = trakwyn_api::config::NodeEnv::Production;
    config.auth.oauth_provider_mode = OAuthProviderMode::Fake;
    config.auth.google_oauth = credentials();
    let app = TestApp::start_with(config).await;
    let response = get(&app, "/auth/oauth/google/start", &[]).await;
    assert!(set_cookies(&response)[0].contains("; HttpOnly; Secure; SameSite=Lax"));
}

#[tokio::test]
async fn a_web_callback_creates_the_user_a_session_and_the_auth_cookies() {
    let app = app().await;
    let response = sign_in(&app, "", "&email=new%40example.com").await;
    assert_eq!(response.status, 302);
    assert_eq!(location(&response), format!("{WEB}/dashboard"));

    let cookies = set_cookies(&response);
    assert!(cookies[0].starts_with("trakwyn_oauth_state=; Max-Age=0; Path=/; Expires="));
    assert!(cookies[1].starts_with("trakwyn_access_token="));
    assert!(cookies[1].contains("HttpOnly"));
    assert!(cookies[2].starts_with("trakwyn_refresh_token="));
    assert!(cookies[3].starts_with("trakwyn_logged_in=1"));

    assert_eq!(count(&app, "User").await, 1);
    assert_eq!(count(&app, "OAuthAccount").await, 1);
    assert_eq!(count(&app, "Session").await, 1);
}

#[tokio::test]
async fn a_returning_user_signs_in_to_the_same_account() {
    let app = app().await;
    sign_in(&app, "", "&email=again%40example.com").await;
    let second = sign_in(&app, "", "&email=again%40example.com").await;
    assert_eq!(location(&second), format!("{WEB}/dashboard"));
    assert_eq!(count(&app, "User").await, 1);
    assert_eq!(count(&app, "Session").await, 2);
}

#[tokio::test]
async fn return_to_is_followed_only_for_a_same_site_path() {
    let app = app().await;
    let ok = sign_in(&app, "?returnTo=%2Fjobs%3Ftab%3D1", "").await;
    assert_eq!(location(&ok), format!("{WEB}/jobs?tab=1"));
    for hostile in ["%2F%2Fevil.example", "https%3A%2F%2Fevil.example", "evil.example"] {
        let refused = sign_in(&app, &format!("?returnTo={hostile}"), "").await;
        assert_eq!(location(&refused), format!("{WEB}/dashboard"), "{hostile}");
    }
}

#[tokio::test]
async fn linking_attaches_the_provider_to_the_signed_in_user() {
    let app = app().await;
    seed_user(&app.db, "u1").await;
    let token = app.access_token("u1");
    // returnTo is ignored when linking.
    let (callback, state_cookie) = through_provider(
        &app,
        "?mode=link&returnTo=%2Fjobs",
        &[cookie("trakwyn_access_token", &token)],
        "&email=linked%40example.com",
    )
    .await;
    let response = get(&app, &callback, &[state_cookie]).await;
    assert_eq!(location(&response), format!("{WEB}/settings/security?oauthLinked=google"));
    assert!(set_cookies(&response).iter().all(|c| !c.starts_with("trakwyn_access_token")));
    let owner: String = sqlx::query_scalar(r#"SELECT "userId" FROM "OAuthAccount""#)
        .fetch_one(app.db.pool())
        .await
        .unwrap();
    assert_eq!(owner, "u1");
}

#[tokio::test]
async fn linking_an_account_that_belongs_to_someone_else_reports_already_linked() {
    let app = app().await;
    sign_in(&app, "", "&email=taken%40example.com").await;
    seed_user(&app.db, "u1").await;
    let token = app.access_token("u1");
    let (callback, state_cookie) = through_provider(
        &app,
        "?mode=link",
        &[cookie("trakwyn_access_token", &token)],
        "&email=taken%40example.com",
    )
    .await;
    let response = get(&app, &callback, &[state_cookie]).await;
    assert_eq!(location(&response), format!("{WEB}/settings/security?oauthError=already_linked"));
}

#[tokio::test]
async fn linking_needs_a_valid_access_cookie() {
    let app = app().await;
    let anonymous = get(&app, "/auth/oauth/google/start?mode=link", &[]).await;
    assert_eq!(anonymous.status, 401);
    assert_eq!(anonymous.body["error"], "Must be logged in to link a provider");
    let forged =
        get(&app, "/auth/oauth/google/start?mode=link", &[cookie("trakwyn_access_token", "junk")])
            .await;
    assert_eq!(forged.status, 401);
    assert_eq!(forged.body["error"], "Session expired");
}

#[tokio::test]
async fn a_mobile_login_hands_back_a_pkce_bound_code_the_app_redeems() {
    let app = app().await;
    let pkce = create_pkce_pair();
    let query = handoff_query("mobile", &pkce.challenge);
    let response = sign_in(&app, &query, "&email=m%40example.com").await;
    let target = location(&response);
    assert!(target.starts_with("trakwyn://oauth-callback?code="), "{target}");
    // The tokens travel in the code, never in cookies.
    assert!(set_cookies(&response).iter().all(|c| c.starts_with("trakwyn_oauth_state=;")));

    let redeemed = redeem(&app, &target, &pkce.verifier).await;
    let tokens = redeemed.data("exchangeMobileOAuthCode");
    assert!(tokens["accessToken"].is_string());
    assert!(tokens["refreshToken"].is_string());

    let refused = redeem(&app, &target, &create_pkce_pair().verifier).await;
    assert_eq!(refused.error_code(), "UNAUTHORIZED");
}

#[tokio::test]
async fn a_non_web_start_requires_a_well_formed_code_challenge() {
    let app = app().await;
    for query in
        ["?platform=mobile", "?platform=mobile&codeChallenge=short", "?platform=extension-tab"]
    {
        let response = get(&app, &format!("/auth/oauth/google/start{query}"), &[]).await;
        assert_eq!(response.status, 400, "{query}");
        assert_eq!(response.body["error"], "Missing or malformed codeChallenge");
    }
}

#[tokio::test]
async fn a_mobile_failure_is_handed_back_to_the_app() {
    let app = app().await;
    let pkce = create_pkce_pair();
    let response = sign_in(&app, &handoff_query("mobile", &pkce.challenge), "&deny=1").await;
    assert_eq!(location(&response), "trakwyn://oauth-callback?oauthError=access_denied");
}

#[tokio::test]
async fn the_chrome_extension_is_handed_back_to_its_chromiumapp_url() {
    let app = app().await;
    let pkce = create_pkce_pair();
    let query =
        format!("{}&extensionId={EXTENSION_ID}", handoff_query("extension", &pkce.challenge));
    let response = sign_in(&app, &query, "&email=chrome%40example.com").await;
    let target = location(&response);
    assert!(
        target.starts_with(&format!("https://{EXTENSION_ID}.chromiumapp.org/?code=")),
        "{target}"
    );
    let redeemed = redeem(&app, &target, &pkce.verifier).await;
    assert!(redeemed.data("exchangeMobileOAuthCode")["accessToken"].is_string());
}

#[tokio::test]
async fn an_extension_outside_the_allowlist_cannot_start_a_login() {
    let app = app().await;
    let pkce = create_pkce_pair();
    for id in ["", OTHER_EXTENSION_ID, "evil.example"] {
        let query = format!("{}&extensionId={id}", handoff_query("extension", &pkce.challenge));
        let response = get(&app, &format!("/auth/oauth/google/start{query}"), &[]).await;
        assert_eq!(response.status, 400, "{id}");
        assert_eq!(response.body["error"], "Unknown extensionId");
    }
}

#[tokio::test]
async fn a_tampered_cookie_naming_an_unlisted_extension_gets_no_handoff() {
    let app = app().await;
    let start = get(&app, "/auth/oauth/google/start", &[]).await;
    let state = param(&url_of(&location(&start)), "state").unwrap();
    let payload = state.split('.').next().unwrap();
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(payload).unwrap();
    let nonce = serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["nonce"]
        .as_str()
        .unwrap()
        .to_string();
    // A browser forging the cookie's platform and extension ID.
    let forged = format!("{nonce}.verifier.extension.challenge.{OTHER_EXTENSION_ID}");
    let response = get(
        &app,
        &format!("/auth/oauth/google/callback?error=access_denied&state={state}"),
        &[cookie(STATE_COOKIE, &forged)],
    )
    .await;
    assert_eq!(location(&response), format!("{WEB}/login?oauthError=access_denied"));
}

#[tokio::test]
async fn the_safari_extension_finishes_in_a_tab_on_the_apis_done_page() {
    let app = app().await;
    let pkce = create_pkce_pair();
    let query = handoff_query("extension-tab", &pkce.challenge);
    let response = sign_in(&app, &query, "&email=safari%40example.com").await;
    let target = location(&response);
    assert!(target.starts_with("http://api.test/auth/oauth/extension/done?code="), "{target}");
    let redeemed = redeem(&app, &target, &pkce.verifier).await;
    assert!(redeemed.data("exchangeMobileOAuthCode")["refreshToken"].is_string());
}

#[tokio::test]
async fn the_forwarded_protocol_builds_the_handoff_url() {
    let app = app().await;
    let pkce = create_pkce_pair();
    let query = handoff_query("extension-tab", &pkce.challenge);
    let forwarded = ("x-forwarded-proto", "https".to_string());
    let start =
        get(&app, &format!("/auth/oauth/google/start{query}"), std::slice::from_ref(&forwarded))
            .await;
    let state_cookie = cookie_value(&start, STATE_COOKIE).unwrap();
    let consent = path_and_query(&url_of(&location(&start)));
    let back = get(&app, &consent, std::slice::from_ref(&forwarded)).await;
    let callback = url_of(&location(&back));
    assert_eq!(callback.scheme(), "https");
    let response =
        get(&app, &path_and_query(&callback), &[forwarded, cookie(STATE_COOKIE, &state_cookie)])
            .await;
    assert!(location(&response).starts_with("https://api.test/auth/oauth/extension/done?code="));
}

#[tokio::test]
async fn the_done_page_is_static_and_uncacheable() {
    let app = app().await;
    let response = get(&app, "/auth/oauth/extension/done?code=secret", &[]).await;
    assert_eq!(response.status, 200);
    let header = |name: &str| response.headers.get(name).unwrap().to_str().unwrap().to_string();
    assert_eq!(header("content-type"), "text/html; charset=utf-8");
    assert_eq!(header("cache-control"), "no-store");
    assert_eq!(header("referrer-policy"), "no-referrer");
    assert_eq!(header("content-security-policy"), "default-src 'none'; style-src 'unsafe-inline'");
    let body = response.body.as_str().unwrap();
    assert!(body.contains("You can close this tab"));
    assert!(!body.contains("secret"));
}

#[tokio::test]
async fn an_unknown_provider_is_a_404_and_an_unconfigured_one_a_503() {
    let app = app().await;
    let unknown = get(&app, "/auth/oauth/myspace/start", &[]).await;
    assert_eq!(unknown.status, 404);
    assert_eq!(unknown.body["error"], "Unknown OAuth provider");
    let callback = get(&app, "/auth/oauth/myspace/callback", &[]).await;
    assert_eq!(callback.status, 404);

    let bare = app_with(OAuthProviderMode::Fake, false).await;
    let unconfigured = get(&bare, "/auth/oauth/github/start", &[]).await;
    assert_eq!(unconfigured.status, 503);
    assert_eq!(unconfigured.body["error"], "github OAuth is not configured");
}

#[tokio::test]
async fn the_provider_declining_redirects_to_login_with_access_denied() {
    let app = app().await;
    let response = sign_in(&app, "", "&deny=1").await;
    assert_eq!(location(&response), format!("{WEB}/login?oauthError=access_denied"));
    assert!(set_cookies(&response)[0].starts_with("trakwyn_oauth_state=; Max-Age=0"));
}

#[tokio::test]
async fn any_other_provider_error_is_reported_as_failed_never_echoed() {
    let app = app().await;
    let response = get(&app, "/auth/oauth/google/callback?error=%3Cscript%3E", &[]).await;
    assert_eq!(location(&response), format!("{WEB}/login?oauthError=failed"));
}

#[tokio::test]
async fn a_callback_without_a_code_or_state_reports_missing_code() {
    let app = app().await;
    for query in ["", "?code=x", "?state=x", "?code=&state="] {
        let response = get(&app, &format!("/auth/oauth/google/callback{query}"), &[]).await;
        assert_eq!(location(&response), format!("{WEB}/login?oauthError=missing_code"), "{query}");
    }
}

#[tokio::test]
async fn a_forged_state_is_rejected() {
    let app = app().await;
    let response = get(&app, "/auth/oauth/google/callback?code=x&state=forged.sig", &[]).await;
    assert_eq!(location(&response), format!("{WEB}/login?oauthError=invalid_state"));
}

#[tokio::test]
async fn a_state_for_another_provider_is_a_mismatch() {
    let app = app().await;
    let (callback, state_cookie) = through_provider(&app, "", &[], "").await;
    let swapped = callback.replace("/google/", "/github/");
    let response = get(&app, &swapped, &[state_cookie]).await;
    assert_eq!(location(&response), format!("{WEB}/login?oauthError=provider_mismatch"));
}

#[tokio::test]
async fn a_callback_from_a_browser_that_did_not_start_the_flow_is_refused() {
    let app = app().await;
    let (callback, state_cookie) =
        through_provider(&app, "", &[], "&email=victim%40example.com").await;
    let invalid = format!("{WEB}/login?oauthError=invalid_state");
    // No cookie at all.
    assert_eq!(location(&get(&app, &callback, &[]).await), invalid);
    // The attacker's own flow's cookie.
    let (_, other_cookie) = through_provider(&app, "", &[], "").await;
    assert_eq!(location(&get(&app, &callback, &[other_cookie]).await), invalid);
    // A half-formed cookie.
    assert_eq!(
        location(&get(&app, &callback, &[cookie(STATE_COOKIE, "nonce-only")]).await),
        invalid
    );
    assert_eq!(count(&app, "User").await, 0);
    // The genuine browser still completes.
    let ok = get(&app, &callback, &[state_cookie]).await;
    assert_eq!(location(&ok), format!("{WEB}/dashboard"));
}

#[tokio::test]
async fn signing_up_with_a_taken_email_is_refused_rather_than_linked() {
    let app = app().await;
    seed_user(&app.db, "u1").await;
    let response = sign_in(&app, "", "&email=u1%40example.com").await;
    assert_eq!(location(&response), format!("{WEB}/login?oauthError=email_in_use"));
    assert!(set_cookies(&response).iter().all(|c| !c.starts_with("trakwyn_access_token")));
}

#[tokio::test]
async fn an_unverified_provider_email_cannot_sign_up() {
    let app = app().await;
    let response = sign_in(&app, "", "&email=u%40example.com&emailVerified=0").await;
    assert_eq!(location(&response), format!("{WEB}/login?oauthError=email_not_verified"));
}

#[tokio::test]
async fn the_consent_screen_validates_its_input() {
    let app = app().await;
    let missing = get(&app, "/auth/oauth/fake-provider/authorize?provider=google", &[]).await;
    assert_eq!(missing.status, 400);
    assert_eq!(missing.body["error"], "Missing provider or state");
    let unknown = get(&app, "/auth/oauth/fake-provider/authorize?provider=x&state=s", &[]).await;
    assert_eq!(unknown.status, 404);
}

#[tokio::test]
async fn the_consent_screen_does_not_exist_outside_fake_mode() {
    let app = app_with(OAuthProviderMode::Real, true).await;
    let response =
        get(&app, "/auth/oauth/fake-provider/authorize?provider=google&state=s", &[]).await;
    assert_ne!(response.status, 302);
}
