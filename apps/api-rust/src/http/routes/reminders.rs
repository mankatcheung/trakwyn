//! `GET|POST /admin/reminders/send`: follow-up reminder emails, driven by
//! Cloud Scheduler.

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
    Router::new().route(admin_routes::REMINDERS_SEND, get(send).post(send))
}

async fn send(State(container): State<Arc<Container>>, headers: HeaderMap) -> Response {
    let route = ScheduledRoute {
        job: admin_jobs::REMINDERS,
        own_secret: container.config.auth.cron_secret.clone(),
        unconfigured_message: "Reminders not configured (CRON_SECRET/CRON_INVOKER_SA missing)",
        also_requires: None,
        failed_message: "Reminders failed",
    };
    let use_case = container.send_follow_up_reminders_use_case();
    serve_scheduled_job(
        &container,
        &headers,
        route,
        || use_case.execute(),
        |summary| ScheduledJobCounts { processed: summary.sent, failed: summary.failed },
        |summary| {
            json!({
                "ok": summary.failed == 0,
                "sent": summary.sent,
                "failed": summary.failed,
                "skipped": summary.skipped,
            })
        },
    )
    .await
}
