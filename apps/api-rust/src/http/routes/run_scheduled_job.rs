//! The flow every `/admin/*` job route shares: is a trigger configured, is the
//! caller allowed, run the job, log one summary line, answer.

use std::future::Future;
use std::time::Instant;

use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::{json, Value};

use super::cron_auth::{authorize_cron_trigger, is_cron_trigger_configured, CronAuthMethod};
use crate::http::container::Container;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::logger::Logger;

/// What a run acted on. `processed` is whatever the job's unit of work is
/// (applications purged, digests sent, reminders sent, notifications
/// delivered) and `failed` the items it could not finish but kept going past,
/// so a partial run is not reported as a clean one.
///
/// Both come from the count the use case already returned. Nothing is
/// recounted here: the route has no view of what the use case skipped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScheduledJobCounts {
    pub processed: usize,
    pub failed: usize,
}

/// Times one run and logs a single summary line for it.
///
/// The jobs only run when an external trigger reaches the API, and without
/// this a successful run left no record at all, so a scheduler that stopped
/// firing looked exactly like a quiet week. One `info` line per run is what
/// makes the absence of one meaningful.
pub async fn run_scheduled_job<T, Fut>(
    job: &'static str,
    auth: CronAuthMethod,
    logger: &dyn Logger,
    execute: impl FnOnce() -> Fut,
    summarize: impl FnOnce(&T) -> ScheduledJobCounts,
) -> Result<T, DomainError>
where
    Fut: Future<Output = DomainResult<T>>,
{
    let started_at = Instant::now();
    let duration_ms =
        |started_at: Instant| i64::try_from(started_at.elapsed().as_millis()).unwrap_or(i64::MAX);

    match execute().await {
        Ok(result) => {
            let event = format!("job.{job}.completed");
            let counts = summarize(&result);
            logger.info(
                &event,
                &[
                    ("event", event.as_str().into()),
                    ("job", job.into()),
                    ("auth", auth.as_str().into()),
                    ("durationMs", duration_ms(started_at).into()),
                    ("processed", counts.processed.into()),
                    ("failed", counts.failed.into()),
                ],
            );
            Ok(result)
        }
        Err(err) => {
            let event = format!("job.{job}.failed");
            logger.error(
                &format!("Scheduled job {job} failed"),
                Some(&err),
                &[
                    ("event", event.as_str().into()),
                    ("job", job.into()),
                    ("auth", auth.as_str().into()),
                    ("durationMs", duration_ms(started_at).into()),
                ],
            );
            Err(err)
        }
    }
}

/// The 503 path: the route is reachable but nothing is configured to
/// authorize a caller, so no trigger could ever get past it. That is a
/// misconfiguration whose only symptom would otherwise be the same silence as
/// a job that never fired, which is exactly what these lines exist to tell
/// apart.
///
/// `reason` is a short stable token rather than the sentence sent to the
/// caller, so it can be grouped on.
pub fn log_scheduled_job_misconfigured(logger: &dyn Logger, job: &str, reason: &str) {
    let event = format!("job.{job}.misconfigured");
    logger.warn(
        &event,
        None,
        &[("event", event.as_str().into()), ("job", job.into()), ("reason", reason.into())],
    );
}

fn error_body(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({ "error": message }))).into_response()
}

/// One `/admin/*` job route.
pub struct ScheduledRoute {
    /// One of `admin_jobs`.
    pub job: &'static str,
    /// A secret only this route accepts, besides `CRON_SECRET`.
    pub own_secret: Option<String>,
    /// The 503 body when no trigger is configured.
    pub unconfigured_message: &'static str,
    /// Set when a second precondition is unmet (checked after the first and
    /// before the caller is authenticated): the log `reason` and the 503 body.
    pub also_requires: Option<(&'static str, &'static str)>,
    /// The 500 body when the run fails.
    pub failed_message: &'static str,
}

const NO_TRIGGER_CONFIGURED: &str = "no_trigger_configured";

/// Runs `execute` for a caller that is allowed to trigger it.
pub async fn serve_scheduled_job<T, Fut>(
    container: &Container,
    headers: &HeaderMap,
    route: ScheduledRoute,
    execute: impl FnOnce() -> Fut,
    summarize: impl FnOnce(&T) -> ScheduledJobCounts,
    respond: impl FnOnce(&T) -> Value,
) -> Response
where
    Fut: Future<Output = DomainResult<T>>,
{
    let logger = container.services.logger.as_ref();
    let auth_config = &container.config.auth;
    let own_secret = route.own_secret.as_deref();

    if !is_cron_trigger_configured(auth_config, own_secret) {
        log_scheduled_job_misconfigured(logger, route.job, NO_TRIGGER_CONFIGURED);
        return error_body(StatusCode::SERVICE_UNAVAILABLE, route.unconfigured_message);
    }
    if let Some((reason, message)) = route.also_requires {
        log_scheduled_job_misconfigured(logger, route.job, reason);
        return error_body(StatusCode::SERVICE_UNAVAILABLE, message);
    }

    let Some(auth) = authorize_cron_trigger(
        headers,
        auth_config,
        own_secret,
        container.services.oidc_token_verifier.as_ref(),
        logger,
        route.job,
    )
    .await
    else {
        return error_body(StatusCode::UNAUTHORIZED, "Unauthorized");
    };

    match run_scheduled_job(route.job, auth, logger, execute, summarize).await {
        Ok(result) => Json(respond(&result)).into_response(),
        Err(_) => error_body(StatusCode::INTERNAL_SERVER_ERROR, route.failed_message),
    }
}
