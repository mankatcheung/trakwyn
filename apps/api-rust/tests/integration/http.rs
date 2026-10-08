//! Transport behaviour that is not about any one domain: health, CORS, the
//! dev-only GraphiQL page.

use axum::body::Body;
use axum::http::header::{
    ACCESS_CONTROL_ALLOW_CREDENTIALS, ACCESS_CONTROL_ALLOW_HEADERS, ACCESS_CONTROL_ALLOW_METHODS,
    ACCESS_CONTROL_ALLOW_ORIGIN, ACCESS_CONTROL_REQUEST_HEADERS, ACCESS_CONTROL_REQUEST_METHOD,
    ORIGIN,
};
use axum::http::{Method, Request};
use serde_json::json;

use trakwyn_api::config::NodeEnv;

use crate::common::{test_config, TestApp};

fn get(path: &str) -> Request<Body> {
    Request::get(path).body(Body::empty()).unwrap()
}

fn preflight(origin: &str) -> Request<Body> {
    Request::builder()
        .method(Method::OPTIONS)
        .uri("/graphql")
        .header(ORIGIN, origin)
        .header(ACCESS_CONTROL_REQUEST_METHOD, "POST")
        .header(ACCESS_CONTROL_REQUEST_HEADERS, "content-type,traceparent")
        .body(Body::empty())
        .unwrap()
}

#[tokio::test]
async fn health_answers_ok() {
    let app = TestApp::start().await;

    let response = app.send(get("/health")).await;

    assert_eq!(response.status, 200);
    assert_eq!(response.body, json!({ "status": "ok" }));
}

#[tokio::test]
async fn a_preflight_from_the_web_app_is_allowed_with_credentials() {
    let app = TestApp::start().await;

    let response = app.send(preflight("http://localhost:3000")).await;

    assert_eq!(response.headers[ACCESS_CONTROL_ALLOW_ORIGIN], "http://localhost:3000");
    assert_eq!(response.headers[ACCESS_CONTROL_ALLOW_CREDENTIALS], "true");
    // `traceparent` has to come back, or the browser strips it and the
    // client's trace never joins the server's.
    let allowed_headers = response.headers[ACCESS_CONTROL_ALLOW_HEADERS].to_str().unwrap();
    assert!(allowed_headers.contains("traceparent"), "{allowed_headers}");
    let allowed_methods = response.headers[ACCESS_CONTROL_ALLOW_METHODS].to_str().unwrap();
    assert!(allowed_methods.contains("PUT"), "{allowed_methods}");
}

#[tokio::test]
async fn a_preflight_from_an_unlisted_origin_gets_no_allow_origin() {
    let app = TestApp::start().await;

    let response = app.send(preflight("https://example.com")).await;

    // Refused, not failed: the browser enforces it from the missing header.
    assert!(response.status.is_success());
    assert!(!response.headers.contains_key(ACCESS_CONTROL_ALLOW_ORIGIN));
}

#[tokio::test]
async fn graphiql_is_served_in_development() {
    let app = TestApp::start().await;

    let response = app.send(get("/graphiql")).await;

    assert_eq!(response.status, 200);
    assert!(response.body.as_str().unwrap().contains("GraphiQL"));
}

#[tokio::test]
async fn graphiql_is_absent_in_production() {
    let config = trakwyn_api::config::Config { node_env: NodeEnv::Production, ..test_config() };
    let app = TestApp::start_with(config).await;

    let response = app.send(get("/graphiql")).await;

    assert_eq!(response.status, 404);
}

#[tokio::test]
async fn an_oversized_body_is_refused() {
    let app = TestApp::start().await;
    let body = json!({ "query": "x".repeat(1024 * 1024 + 1) }).to_string();
    let request = Request::post("/graphql")
        .header("content-type", "application/json")
        .body(Body::from(body))
        .unwrap();

    let response = app.send(request).await;

    assert_eq!(response.status, 413, "body: {}", response.body);
}

#[tokio::test]
async fn a_body_that_is_not_a_graphql_request_is_a_400() {
    let app = TestApp::start().await;
    let request = Request::post("/graphql")
        .header("content-type", "application/json")
        .body(Body::from("{ not json"))
        .unwrap();

    let response = app.send(request).await;

    assert_eq!(response.status, 400);
    assert_eq!(response.body["errors"][0]["message"], "Invalid request body");
}

#[tokio::test]
async fn a_query_for_a_field_that_does_not_exist_reports_a_graphql_error() {
    let app = TestApp::start().await;

    let response = app.graphql("{ nope }", json!({}), crate::common::Auth::None).await;

    assert_eq!(response.status, 200);
    assert!(response.body["errors"][0]["message"].as_str().unwrap().contains("nope"));
}
