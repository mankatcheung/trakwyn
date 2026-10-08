//! Builds the router without binding a port, so integration tests drive the
//! fully wired app in-process and `main.rs` only adds the listener.

use std::net::SocketAddr;
use std::sync::Arc;

use async_graphql::http::GraphiQLSource;
use async_graphql_axum::GraphQLResponse;
use axum::body::Bytes;
use axum::extract::{ConnectInfo, DefaultBodyLimit, State};
use axum::http::{Extensions, HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::json;
use tower_http::cors::{AllowHeaders, AllowOrigin, CorsLayer};

use crate::config::Config;
use crate::http::constants::{
    routes, BODY_LIMIT_BYTES, EXTENSION_ORIGIN_SCHEMES, PREVIEW_ORIGIN_SUFFIX,
};
use crate::http::container::Container;
use crate::http::graphql::{build_schema, ApiSchema};
use crate::http::request_context::RequestContext;
use crate::http::routes::admin;
use crate::http::routes::fake_llm_completions::fake_llm_completions_routes;
use crate::http::routes::health::health;
use crate::http::routes::{chat_stream, mcp, mcp_oauth, uploads};

#[derive(Clone)]
struct AppState {
    container: Arc<Container>,
    schema: ApiSchema,
}

/// Whether a cross-origin browser request may read the response.
///
/// A refused origin is answered without `Access-Control-Allow-Origin`, which
/// is what enforces CORS: the browser blocks the response. It is not an error.
fn is_allowed_origin(origin: &str, configured: &[String]) -> bool {
    // The Trakwyn Clipper, in Chrome and in Safari.
    EXTENSION_ORIGIN_SCHEMES.iter().any(|scheme| origin.starts_with(scheme))
        || configured.iter().any(|allowed| allowed == origin)
        || origin.ends_with(PREVIEW_ORIGIN_SUFFIX)
}

fn cors_layer(config: &Config) -> CorsLayer {
    let configured = config.cors_origins.clone();
    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(move |origin: &HeaderValue, _| {
            origin.to_str().is_ok_and(|origin| is_allowed_origin(origin, &configured))
        }))
        .allow_credentials(true)
        // PUT is listed for the local-storage upload route; without it the
        // preflight omits PUT and the browser drops the upload.
        .allow_methods([Method::GET, Method::HEAD, Method::POST, Method::PUT, Method::DELETE])
        // Mirrored rather than listed: a fixed list would have to name the
        // clients' `traceparent`, and forgetting it breaks trace propagation.
        .allow_headers(AllowHeaders::mirror_request())
}

/// The body is read as bytes and parsed here, rather than through
/// async-graphql's own extractor, so axum's body limit applies (413) and a
/// body that is not a GraphQL request gets a 400 in the GraphQL error shape.
async fn graphql(
    State(state): State<AppState>,
    headers: HeaderMap,
    extensions: Extensions,
    body: Bytes,
) -> Response {
    let Ok(request) = serde_json::from_slice::<async_graphql::Request>(&body) else {
        let body = json!({ "data": null, "errors": [{ "message": "Invalid request body" }] });
        return (StatusCode::BAD_REQUEST, Json(body)).into_response();
    };

    let peer = extensions.get::<ConnectInfo<SocketAddr>>().map(|ConnectInfo(peer)| *peer);
    let context = RequestContext::from_request(&state.container, &headers, peer).await;
    GraphQLResponse::from(state.schema.execute(request.data(context)).await).into_response()
}

async fn graphiql() -> Html<String> {
    Html(GraphiQLSource::build().endpoint(routes::GRAPHQL).finish())
}

pub fn build_router(container: Arc<Container>) -> Router {
    let schema = build_schema(container.clone());
    let cors = cors_layer(&container.config);
    let production = container.config.is_production();

    let router =
        Router::new().route(routes::HEALTH, get(health)).route(routes::GRAPHQL, post(graphql));
    let router = if production { router } else { router.route(routes::GRAPHIQL, get(graphiql)) };
    let router = router.merge(mcp_oauth::router(container.clone()));
    let router = router.merge(mcp::router(container.clone()));
    let router = router.merge(chat_stream::router(container.clone()));
    // The upload target and read-back exist only for local-disk storage.
    let router = match &container.services.local_storage {
        Some(local_storage) => router.merge(uploads::router(local_storage.clone())),
        None => router,
    };
    // A stand-in OpenAI-compatible endpoint for e2e and CI; never present
    // unless explicitly opted into.
    let router = if container.config.llm_provider_mode.is_fake() {
        router.merge(fake_llm_completions_routes())
    } else {
        router
    };

    let router = router.merge(admin::router(container.clone()));

    router
        .layer(DefaultBodyLimit::max(BODY_LIMIT_BYTES))
        .layer(cors)
        .with_state(AppState { container, schema })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn configured() -> Vec<String> {
        vec!["https://www.trakwyn.com".to_string()]
    }

    #[test]
    fn allows_a_configured_origin_exactly() {
        assert!(is_allowed_origin("https://www.trakwyn.com", &configured()));
        assert!(!is_allowed_origin("https://www.trakwyn.com.evil.example", &configured()));
        assert!(!is_allowed_origin("http://www.trakwyn.com", &configured()));
    }

    #[test]
    fn allows_the_extension_in_chrome_and_safari() {
        assert!(is_allowed_origin("chrome-extension://abcdefgh", &configured()));
        assert!(is_allowed_origin("safari-web-extension://1234", &configured()));
    }

    #[test]
    fn allows_vercel_previews() {
        assert!(is_allowed_origin("https://trakwyn-git-feature.vercel.app", &configured()));
    }

    #[test]
    fn refuses_an_unlisted_origin() {
        assert!(!is_allowed_origin("https://example.com", &configured()));
    }
}
