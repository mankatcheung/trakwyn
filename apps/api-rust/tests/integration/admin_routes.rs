//! The `/admin/*` job routes and `/vapid-public-key`, through the fully wired
//! router, a real database and doubles for the outside world.

use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use axum::body::Body;
use axum::http::header::AUTHORIZATION;
use axum::http::{Request, StatusCode};
use chrono::{DateTime, TimeDelta, Utc};
use serde_json::json;

use trakwyn_api::config::push::PushConfig;
use trakwyn_api::config::Config;
use trakwyn_api::use_cases::clock::now;
use trakwyn_api::use_cases::ports::logger::{LogFields, LogValue, LoggedError, Logger};
use trakwyn_api::use_cases::ports::oidc_token_verifier::{OidcTokenVerifier, VerifiedOidcIdentity};
use trakwyn_api::use_cases::ports::web_push_service::{
    PushDeliveryError, PushDeliveryResult, PushPayload, PushSubscriptionKeys, WebPushService,
};

use crate::common::{seed_application, seed_user, test_config, Response, TestApp};

const CRON_SECRET: &str = "the-cron-secret";
const DIGEST_SECRET: &str = "the-digest-secret";
const INVOKER: &str = "cron-invoker@project.iam.gserviceaccount.com";
const API_ORIGIN: &str = "https://api.example.com";
const ID_TOKEN: &str = "a-google-id-token";

#[derive(Debug, Clone)]
struct Line {
    level: &'static str,
    message: String,
    fields: Vec<(&'static str, LogValue)>,
}

impl Line {
    fn field(&self, name: &str) -> Option<&LogValue> {
        self.fields.iter().find(|(key, _)| *key == name).map(|(_, value)| value)
    }

    fn text(&self, name: &str) -> String {
        match self.field(name) {
            Some(LogValue::Str(text)) => text.clone(),
            other => panic!("no text field {name}: {other:?}"),
        }
    }

    fn int(&self, name: &str) -> i64 {
        match self.field(name) {
            Some(LogValue::Int(number)) => *number,
            other => panic!("no int field {name}: {other:?}"),
        }
    }
}

#[derive(Default)]
struct RecordingLogger {
    lines: Mutex<Vec<Line>>,
}

impl RecordingLogger {
    fn lines(&self) -> Vec<Line> {
        self.lines.lock().unwrap().clone()
    }

    fn record(&self, level: &'static str, message: &str, fields: LogFields<'_>) {
        self.lines.lock().unwrap().push(Line {
            level,
            message: message.to_string(),
            fields: fields.to_vec(),
        });
    }
}

impl Logger for RecordingLogger {
    fn error(&self, message: &str, _err: LoggedError<'_>, fields: LogFields<'_>) {
        self.record("error", message, fields);
    }

    fn warn(&self, message: &str, _err: LoggedError<'_>, fields: LogFields<'_>) {
        self.record("warn", message, fields);
    }

    fn info(&self, message: &str, fields: LogFields<'_>) {
        self.record("info", message, fields);
    }
}

/// Google's verifier, standing in: accepts one token, for the invoker.
struct StubVerifier;

#[async_trait]
impl OidcTokenVerifier for StubVerifier {
    async fn verify(&self, token: &str, audience: &str) -> Option<VerifiedOidcIdentity> {
        (token == ID_TOKEN && audience == API_ORIGIN)
            .then(|| VerifiedOidcIdentity { email: INVOKER.to_string() })
    }
}

/// Records pushes; an endpoint containing `gone` answers 410.
#[derive(Default)]
struct RecordingWebPush {
    sent: Mutex<Vec<(PushSubscriptionKeys, PushPayload)>>,
}

#[async_trait]
impl WebPushService for RecordingWebPush {
    async fn send(
        &self,
        subscription: &PushSubscriptionKeys,
        payload: &PushPayload,
    ) -> PushDeliveryResult {
        self.sent.lock().unwrap().push((subscription.clone(), payload.clone()));
        if subscription.endpoint.contains("gone") {
            return Err(PushDeliveryError::with_status("Received unexpected response code", 410));
        }
        Ok(())
    }
}

/// The config, with whatever of the cron settings the test names.
fn config(cron: bool, digest: bool, oidc: bool) -> Config {
    let base = test_config();
    let mut auth = base.auth.clone();
    auth.cron_secret = cron.then(|| CRON_SECRET.to_string());
    auth.digest_admin_secret = digest.then(|| DIGEST_SECRET.to_string());
    if oidc {
        auth.cron_invoker_sa = Some(INVOKER.to_string());
        auth.api_origin = Some(API_ORIGIN.to_string());
    }
    Config { auth, ..base }
}

fn with_vapid(config: Config) -> Config {
    let push = PushConfig {
        vapid_public_key: "the-public-key".to_string(),
        vapid_private_key: "the-private-key".to_string(),
        vapid_subject: "mailto:ops@example.com".to_string(),
    };
    Config { push, ..config }
}

struct Harness {
    app: TestApp,
    logger: Arc<RecordingLogger>,
    web_push: Arc<RecordingWebPush>,
}

async fn start(config: Config) -> Harness {
    let logger = Arc::new(RecordingLogger::default());
    let web_push = Arc::new(RecordingWebPush::default());
    let app = TestApp::start_customised(config, |container| {
        container.services.logger = logger.clone();
        container.services.oidc_token_verifier = Arc::new(StubVerifier);
        container.services.web_push_service = web_push.clone();
    })
    .await;
    Harness { app, logger, web_push }
}

impl Harness {
    async fn call(&self, method: &str, path: &str, authorization: Option<&str>) -> Response {
        let mut request = Request::builder().method(method).uri(path);
        if let Some(value) = authorization {
            request = request.header(AUTHORIZATION, value);
        }
        self.app.send(request.body(Body::empty()).unwrap()).await
    }

    async fn post(&self, path: &str, token: &str) -> Response {
        self.call("POST", path, Some(&format!("Bearer {token}"))).await
    }

    fn only_line(&self) -> Line {
        let lines = self.logger.lines();
        assert_eq!(lines.len(), 1, "{lines:?}");
        lines[0].clone()
    }
}

async fn set_follow_up(app: &TestApp, application_id: &str, at: DateTime<Utc>) {
    sqlx::query(r#"UPDATE "JobApplication" SET "followUpAt" = $2 WHERE "id" = $1"#)
        .bind(application_id)
        .bind(at)
        .execute(app.db.pool())
        .await
        .unwrap();
}

async fn reminder_sent(app: &TestApp, application_id: &str) -> Option<DateTime<Utc>> {
    sqlx::query_scalar(r#"SELECT "reminderSentAt" FROM "JobApplication" WHERE "id" = $1"#)
        .bind(application_id)
        .fetch_one(app.db.pool())
        .await
        .unwrap()
}

async fn seed_due_application(app: &TestApp, id: &str, user_id: &str) {
    seed_application(&app.db, id, user_id).await;
    set_follow_up(app, id, now() + TimeDelta::hours(2)).await;
}

const ROUTES: [(&str, &str); 4] = [
    ("/admin/digest/send", "digest"),
    ("/admin/reminders/send", "reminders"),
    ("/admin/trash/purge", "trash_purge"),
    ("/admin/push-notifications/send", "push_notifications"),
];

// --- authentication, shared by every job route ---

#[tokio::test]
async fn every_route_answers_503_and_says_so_when_no_trigger_is_configured() {
    for (path, job) in ROUTES {
        let h = start(with_vapid(config(false, false, false))).await;

        let response = h.post(path, "anything").await;

        assert_eq!(response.status, StatusCode::SERVICE_UNAVAILABLE, "{path}");
        assert!(response.body["error"].as_str().unwrap().contains("not configured"), "{path}");
        let line = h.only_line();
        assert_eq!(line.level, "warn");
        assert_eq!(line.message, format!("job.{job}.misconfigured"));
        assert_eq!(line.text("event"), format!("job.{job}.misconfigured"));
        assert_eq!(line.text("job"), job);
        assert_eq!(line.text("reason"), "no_trigger_configured");
    }
}

#[tokio::test]
async fn every_route_answers_401_without_a_bearer_token() {
    for (path, job) in ROUTES {
        let h = start(with_vapid(config(true, true, false))).await;

        let missing = h.call("POST", path, None).await;
        let basic = h.call("GET", path, Some("Basic abc")).await;

        assert_eq!(missing.status, StatusCode::UNAUTHORIZED, "{path}");
        assert_eq!(missing.body, json!({ "error": "Unauthorized" }));
        assert_eq!(basic.status, StatusCode::UNAUTHORIZED, "{path}");
        let lines = h.logger.lines();
        assert_eq!(lines.len(), 2);
        for line in lines {
            assert_eq!(line.level, "warn");
            assert_eq!(line.message, "Cron trigger rejected");
            assert_eq!(line.text("event"), "cron.auth.rejected");
            assert_eq!(line.text("job"), job);
            assert_eq!(line.text("reason"), "missing");
        }
    }
}

#[tokio::test]
async fn every_route_answers_401_for_a_token_that_matches_nothing() {
    for (path, job) in ROUTES {
        let h = start(with_vapid(config(true, true, true))).await;

        let response = h.post(path, "wrong").await;

        assert_eq!(response.status, StatusCode::UNAUTHORIZED, "{path}");
        let line = h.only_line();
        assert_eq!(line.text("reason"), "invalid");
        assert_eq!(line.text("job"), job);
    }
}

#[tokio::test]
async fn a_secret_close_to_the_real_one_is_refused() {
    let h = start(config(true, false, false)).await;

    let shorter = h.post("/admin/reminders/send", &CRON_SECRET[..CRON_SECRET.len() - 1]).await;
    let longer = h.post("/admin/reminders/send", &format!("{CRON_SECRET}x")).await;

    assert_eq!(shorter.status, StatusCode::UNAUTHORIZED);
    assert_eq!(longer.status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn the_digest_secret_opens_only_the_digest_route() {
    let h = start(with_vapid(config(true, true, false))).await;

    let digest = h.post("/admin/digest/send", DIGEST_SECRET).await;
    let reminders = h.post("/admin/reminders/send", DIGEST_SECRET).await;

    assert_eq!(digest.status, StatusCode::OK);
    assert_eq!(reminders.status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn the_digest_route_is_configured_by_its_own_secret_alone() {
    let h = start(config(false, true, false)).await;

    let digest = h.post("/admin/digest/send", DIGEST_SECRET).await;
    let reminders = h.post("/admin/reminders/send", DIGEST_SECRET).await;

    assert_eq!(digest.status, StatusCode::OK);
    assert_eq!(reminders.status, StatusCode::SERVICE_UNAVAILABLE);
}

// --- reminders ---

#[tokio::test]
async fn reminders_email_a_due_application_and_mark_it_sent() {
    let h = start(config(true, false, false)).await;
    seed_user(&h.app.db, "u1").await;
    seed_due_application(&h.app, "a1", "u1").await;

    let response = h.post("/admin/reminders/send", CRON_SECRET).await;

    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(response.body, json!({ "ok": true, "sent": 1, "failed": 0, "skipped": 0 }));
    assert!(reminder_sent(&h.app, "a1").await.is_some());
    let line = h.only_line();
    assert_eq!(line.level, "info");
    assert_eq!(line.message, "job.reminders.completed");
    assert_eq!(line.text("event"), "job.reminders.completed");
    assert_eq!(line.text("job"), "reminders");
    assert_eq!(line.text("auth"), "secret");
    assert_eq!(line.int("processed"), 1);
    assert_eq!(line.int("failed"), 0);
    assert!(line.int("durationMs") >= 0);
}

#[tokio::test]
async fn reminders_skip_an_owner_who_turned_them_off() {
    let h = start(config(true, false, false)).await;
    seed_user(&h.app.db, "u1").await;
    sqlx::query(r#"UPDATE "User" SET "followUpRemindersEnabled" = false WHERE "id" = 'u1'"#)
        .execute(h.app.db.pool())
        .await
        .unwrap();
    seed_due_application(&h.app, "a1", "u1").await;

    let response = h.post("/admin/reminders/send", CRON_SECRET).await;

    assert_eq!(response.body, json!({ "ok": true, "sent": 0, "failed": 0, "skipped": 1 }));
    assert!(reminder_sent(&h.app, "a1").await.is_none());
}

#[tokio::test]
async fn the_routes_answer_to_get_as_well_as_post() {
    let h = start(config(true, false, false)).await;

    let response = h.call("GET", "/admin/reminders/send", Some("Bearer the-cron-secret")).await;

    assert_eq!(response.status, StatusCode::OK);
}

#[tokio::test]
async fn a_verified_scheduler_token_is_admitted_and_reported_as_oidc() {
    let h = start(config(false, false, true)).await;
    seed_user(&h.app.db, "u1").await;
    seed_due_application(&h.app, "a1", "u1").await;

    let response = h.post("/admin/reminders/send", ID_TOKEN).await;

    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(response.body["sent"], 1);
    assert_eq!(h.only_line().text("auth"), "oidc");
}

#[tokio::test]
async fn a_scheduler_token_is_refused_when_the_invoker_is_not_configured() {
    let h = start(config(true, false, false)).await;

    let response = h.post("/admin/reminders/send", ID_TOKEN).await;

    assert_eq!(response.status, StatusCode::UNAUTHORIZED);
}

// --- digest ---

#[tokio::test]
async fn the_digest_run_emails_a_user_with_applications_and_stamps_them() {
    let h = start(config(true, false, false)).await;
    seed_user(&h.app.db, "u1").await;
    seed_user(&h.app.db, "u2").await;
    seed_application(&h.app.db, "a1", "u1").await;

    let response = h.post("/admin/digest/send", CRON_SECRET).await;

    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(
        response.body,
        json!({ "ok": true, "summary": { "totalUsers": 2, "sent": 1, "skipped": 1, "failed": 0 } })
    );
    let stamped: Vec<(String, Option<DateTime<Utc>>)> =
        sqlx::query_as(r#"SELECT "id", "lastDigestSentAt" FROM "User" ORDER BY "id""#)
            .fetch_all(h.app.db.pool())
            .await
            .unwrap();
    assert!(stamped[0].1.is_some());
    assert!(stamped[1].1.is_none());
    let line = h.only_line();
    assert_eq!(line.message, "job.digest.completed");
    assert_eq!(line.int("processed"), 1);
    assert_eq!(line.int("failed"), 0);
}

#[tokio::test]
async fn a_second_digest_run_inside_the_window_sends_nothing() {
    let h = start(config(true, false, false)).await;
    seed_user(&h.app.db, "u1").await;
    seed_application(&h.app.db, "a1", "u1").await;
    h.post("/admin/digest/send", CRON_SECRET).await;

    let response = h.post("/admin/digest/send", CRON_SECRET).await;

    assert_eq!(
        response.body["summary"],
        json!({ "totalUsers": 1, "sent": 0, "skipped": 1, "failed": 0 })
    );
}

// --- trash purge ---

#[tokio::test]
async fn the_purge_removes_applications_trashed_over_thirty_days_ago() {
    let h = start(config(true, false, false)).await;
    seed_user(&h.app.db, "u1").await;
    seed_application(&h.app.db, "old", "u1").await;
    seed_application(&h.app.db, "recent", "u1").await;
    for (id, days) in [("old", 31), ("recent", 29)] {
        sqlx::query(r#"UPDATE "JobApplication" SET "deletedAt" = $2 WHERE "id" = $1"#)
            .bind(id)
            .bind(now() - TimeDelta::days(days))
            .execute(h.app.db.pool())
            .await
            .unwrap();
    }

    let response = h.post("/admin/trash/purge", CRON_SECRET).await;

    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(response.body, json!({ "ok": true, "purged": 1, "failed": 0 }));
    let left: Vec<String> = sqlx::query_scalar(r#"SELECT "id" FROM "JobApplication""#)
        .fetch_all(h.app.db.pool())
        .await
        .unwrap();
    assert_eq!(left, vec!["recent".to_string()]);
    let line = h.only_line();
    assert_eq!(line.message, "job.trash_purge.completed");
    assert_eq!(line.int("processed"), 1);
}

// --- push notifications ---

async fn seed_push_user(app: &TestApp, id: &str, endpoint: &str) {
    seed_user(&app.db, id).await;
    sqlx::query(r#"UPDATE "User" SET "pushNotificationsEnabled" = true WHERE "id" = $1"#)
        .bind(id)
        .execute(app.db.pool())
        .await
        .unwrap();
    sqlx::query(
        r#"INSERT INTO "PushSubscription" ("id", "userId", "provider", "endpoint", "p256dh", "auth", "createdAt", "updatedAt")
           VALUES ($1, $2, 'web', $3, 'key', 'secret', $4, $4)"#,
    )
    .bind(format!("sub-{id}"))
    .bind(id)
    .bind(endpoint)
    .bind(now())
    .execute(app.db.pool())
    .await
    .unwrap();
}

#[tokio::test]
async fn the_push_route_answers_503_and_warns_when_the_vapid_keys_are_missing() {
    let h = start(config(true, false, false)).await;

    let response = h.post("/admin/push-notifications/send", "not-even-checked").await;

    assert_eq!(response.status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(
        response.body,
        json!({ "error": "Push notifications not configured (VAPID keys missing)" })
    );
    let line = h.only_line();
    assert_eq!(line.message, "job.push_notifications.misconfigured");
    assert_eq!(line.text("reason"), "vapid_keys_missing");
}

#[tokio::test]
async fn the_push_route_stores_the_notification_and_delivers_it() {
    let h = start(with_vapid(config(true, false, false))).await;
    seed_push_user(&h.app, "u1", "https://push.test/ok").await;
    seed_due_application(&h.app, "a1", "u1").await;

    let response = h.post("/admin/push-notifications/send", CRON_SECRET).await;

    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(response.body, json!({ "ok": true, "delivered": 1, "failed": 0 }));
    let sent = h.web_push.sent.lock().unwrap().clone();
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].0.endpoint, "https://push.test/ok");
    assert_eq!(
        sent[0].1,
        PushPayload {
            title: "Follow up: Acme".to_string(),
            body: "Time to follow up on your Engineer application".to_string(),
            url: "/applications/a1?section=contacts".to_string(),
        }
    );
    let stored: Vec<(String, String, String, Option<String>)> =
        sqlx::query_as(r#"SELECT "userId", "type", "title", "url" FROM "Notification""#)
            .fetch_all(h.app.db.pool())
            .await
            .unwrap();
    assert_eq!(
        stored,
        vec![(
            "u1".to_string(),
            "follow_up_reminder".to_string(),
            "Follow up: Acme".to_string(),
            Some("/applications/a1?section=contacts".to_string())
        )]
    );
    let line = h.only_line();
    assert_eq!(line.message, "job.push_notifications.completed");
    assert_eq!(line.int("processed"), 1);
}

#[tokio::test]
async fn a_gone_subscription_is_deleted_and_the_run_reports_the_failure() {
    let h = start(with_vapid(config(true, false, false))).await;
    seed_push_user(&h.app, "u1", "https://push.test/gone").await;
    seed_due_application(&h.app, "a1", "u1").await;

    let response = h.post("/admin/push-notifications/send", CRON_SECRET).await;

    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(response.body, json!({ "ok": false, "delivered": 0, "failed": 1 }));
    let remaining: i64 = sqlx::query_scalar(r#"SELECT count(*) FROM "PushSubscription""#)
        .fetch_one(h.app.db.pool())
        .await
        .unwrap();
    assert_eq!(remaining, 0);
    let lines = h.logger.lines();
    assert!(lines.iter().any(|line| line.message == "Failed to send push notification"));
    let summary = lines.last().unwrap();
    assert_eq!(summary.message, "job.push_notifications.completed");
    assert_eq!(summary.int("failed"), 1);
}

#[tokio::test]
async fn an_upcoming_interview_is_announced_once() {
    let h = start(with_vapid(config(true, false, false))).await;
    seed_push_user(&h.app, "u1", "https://push.test/ok").await;
    seed_application(&h.app.db, "a1", "u1").await;
    sqlx::query(
        r#"INSERT INTO "InterviewRound" ("id", "applicationId", "type", "scheduledAt", "createdAt", "updatedAt")
           VALUES ('r1', 'a1', 'technical', $1, $2, $2)"#,
    )
    .bind(now() + TimeDelta::hours(3))
    .bind(now())
    .execute(h.app.db.pool())
    .await
    .unwrap();

    let first = h.post("/admin/push-notifications/send", CRON_SECRET).await;
    let second = h.post("/admin/push-notifications/send", CRON_SECRET).await;

    assert_eq!(first.body, json!({ "ok": true, "delivered": 1, "failed": 0 }));
    assert_eq!(second.body, json!({ "ok": true, "delivered": 0, "failed": 0 }));
    let sent = h.web_push.sent.lock().unwrap().clone();
    assert_eq!(sent[0].1.title, "Upcoming interview: Acme");
    assert!(sent[0].1.body.starts_with("Engineer \u{2014} technical interview tomorrow at "));
    assert_eq!(sent[0].1.url, "/applications/a1?section=interviews");
}

// --- the public VAPID key ---

#[tokio::test]
async fn the_vapid_public_key_is_served_without_authentication() {
    let h = start(with_vapid(config(false, false, false))).await;

    let response = h.call("GET", "/vapid-public-key", None).await;

    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(response.body, json!({ "publicKey": "the-public-key" }));
}

#[tokio::test]
async fn the_vapid_public_key_is_503_when_vapid_is_not_configured() {
    let h = start(config(false, false, false)).await;

    let response = h.call("GET", "/vapid-public-key", None).await;

    assert_eq!(response.status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(response.body, json!({ "error": "VAPID not configured" }));
}
