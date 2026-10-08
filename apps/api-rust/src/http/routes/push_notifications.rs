//! Push notification delivery triggered by an external cron job, plus the
//! public VAPID key the web client needs to create a subscription (so the key
//! is not baked into the client bundle).
//!
//! No production schedule drives the send route, so it only runs when
//! triggered by hand.

use std::sync::Arc;

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::json;

use super::run_scheduled_job::{serve_scheduled_job, ScheduledJobCounts, ScheduledRoute};
use crate::http::constants::{admin_jobs, admin_routes};
use crate::http::container::Container;

const VAPID_KEYS_MISSING: &str = "vapid_keys_missing";

pub fn router() -> Router<Arc<Container>> {
    Router::new()
        .route(admin_routes::PUSH_NOTIFICATIONS_SEND, get(send).post(send))
        .route(admin_routes::VAPID_PUBLIC_KEY, get(vapid_public_key))
}

async fn send(State(container): State<Arc<Container>>, headers: HeaderMap) -> Response {
    let route = ScheduledRoute {
        job: admin_jobs::PUSH_NOTIFICATIONS,
        own_secret: container.config.auth.cron_secret.clone(),
        unconfigured_message:
            "Push notifications not configured (CRON_SECRET/CRON_INVOKER_SA missing)",
        also_requires: (!container.config.push.is_configured()).then_some((
            VAPID_KEYS_MISSING,
            "Push notifications not configured (VAPID keys missing)",
        )),
        failed_message: "Push notifications failed",
    };
    let use_case = container.send_push_notifications_use_case();
    serve_scheduled_job(
        &container,
        &headers,
        route,
        || use_case.execute(),
        |summary| ScheduledJobCounts { processed: summary.delivered, failed: summary.failed },
        |summary| {
            json!({
                "ok": summary.failed == 0,
                "delivered": summary.delivered,
                "failed": summary.failed,
            })
        },
    )
    .await
}

async fn vapid_public_key(State(container): State<Arc<Container>>) -> Response {
    let public_key = &container.config.push.vapid_public_key;
    if public_key.is_empty() {
        let body = json!({ "error": "VAPID not configured" });
        return (StatusCode::SERVICE_UNAVAILABLE, Json(body)).into_response();
    }
    Json(json!({ "publicKey": public_key })).into_response()
}
