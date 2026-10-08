//! `GET|POST /admin/trash/purge`: removes applications that have served their
//! thirty days in Trash.
//!
//! Reports the failure count rather than swallowing it: the use case keeps
//! going past a failure so one unreachable blob cannot strand everything
//! behind it, which would otherwise make a partial run indistinguishable from
//! a clean one.

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
    Router::new().route(admin_routes::TRASH_PURGE, get(purge).post(purge))
}

async fn purge(State(container): State<Arc<Container>>, headers: HeaderMap) -> Response {
    let route = ScheduledRoute {
        job: admin_jobs::TRASH_PURGE,
        own_secret: container.config.auth.cron_secret.clone(),
        unconfigured_message: "Purge not configured (CRON_SECRET/CRON_INVOKER_SA missing)",
        also_requires: None,
        failed_message: "Purge failed",
    };
    let use_case = container.purge_expired_applications_use_case();
    serve_scheduled_job(
        &container,
        &headers,
        route,
        || use_case.execute(),
        |result| ScheduledJobCounts { processed: result.purged, failed: result.failed },
        |result| json!({ "ok": result.failed == 0, "purged": result.purged, "failed": result.failed }),
    )
    .await
}
