//! `GET|POST /admin/digest/send`: the weekly/daily digest run Cloud Scheduler
//! triggers. `GET` is kept so it can be triggered by hand from a browser or
//! curl.

use std::sync::Arc;

use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::Response;
use axum::routing::get;
use axum::Router;
use serde_json::json;

use super::run_scheduled_job::{serve_scheduled_job, ScheduledJobCounts, ScheduledRoute};
use crate::http::constants::{admin_jobs, admin_routes};
use crate::http::container::Container;

pub fn router() -> Router<Arc<Container>> {
    Router::new().route(admin_routes::DIGEST_SEND, get(send).post(send))
}

async fn send(State(container): State<Arc<Container>>, headers: HeaderMap) -> Response {
    let route = ScheduledRoute {
        job: admin_jobs::DIGEST,
        own_secret: container.config.auth.digest_admin_secret.clone(),
        unconfigured_message:
            "Digest not configured (DIGEST_ADMIN_SECRET/CRON_SECRET/CRON_INVOKER_SA missing)",
        also_requires: None,
        failed_message: "Digest failed",
    };
    let use_case = container.send_weekly_digest_use_case();
    serve_scheduled_job(
        &container,
        &headers,
        route,
        || use_case.execute(),
        |summary| ScheduledJobCounts { processed: summary.sent, failed: summary.failed },
        |summary| {
            json!({
                "ok": true,
                "summary": {
                    "totalUsers": summary.total_users,
                    "sent": summary.sent,
                    "skipped": summary.skipped,
                    "failed": summary.failed,
                },
            })
        },
    )
    .await
}
