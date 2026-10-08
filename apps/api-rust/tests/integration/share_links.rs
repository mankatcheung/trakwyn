//! Share links, and the public summary behind one, through the real GraphQL
//! endpoint and a real database.

use chrono::TimeDelta;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use trakwyn_api::domain::interview_round::{InterviewRoundOutcome, InterviewRoundType};
use trakwyn_api::use_cases::clock::now;
use trakwyn_api::use_cases::ports::CreateInterviewRoundData;

use crate::common::{seed_user, Auth, TestApp};

const CREATE: &str =
    "mutation($name: String!) { createShareLink(name: $name) { id name token createdAt } }";
const LIST: &str = "{ shareLinks { id name lastUsedAt createdAt } }";
const DELETE: &str = "mutation($id: ID!) { deleteShareLink(id: $id) }";
const SUMMARY: &str = "query($token: String!) {
    sharedSummary(token: $token) {
        statusCounts { status count }
        totalApplications totalInterviews upcomingInterviews applicationsUpdatedLast7Days
        generatedAt
    }
}";

/// A link token and its hash as `apps/api` mints and stores them. The hash
/// was printed by Node: `createHash('sha256').update(raw).digest('hex')`.
const NODE_RAW_TOKEN: &str = "jfsl_ffeeddccbbaa99887766554433221100ffeeddccbbaa9988";
const NODE_TOKEN_HASH: &str = "50197ec14202ecd8631d9f484971cc8e7cfd8e93c405b6f4bbb1ecfe2cda778f";

async fn app_with_owner() -> (TestApp, String) {
    let app = TestApp::start().await;
    seed_user(&app.db, "owner").await;
    let token = app.access_token("owner");
    (app, token)
}

async fn create(app: &TestApp, token: &str, name: &str) -> Value {
    app.graphql(CREATE, json!({ "name": name }), Auth::Bearer(token))
        .await
        .data("createShareLink")
        .clone()
}

async fn count(app: &TestApp) -> i64 {
    sqlx::query_scalar(r#"SELECT count(*) FROM "ShareLink""#)
        .fetch_one(app.db.pool())
        .await
        .unwrap()
}

async fn seed_application(app: &TestApp, id: &str, user_id: &str, status: &str, age: TimeDelta) {
    sqlx::query(
        r#"INSERT INTO "JobApplication"
               ("id", "userId", "company", "role", "status", "createdAt", "updatedAt")
           VALUES ($1, $2, 'Secret Corp', 'Secret Role', $3, $4, $4)"#,
    )
    .bind(id)
    .bind(user_id)
    .bind(status)
    .bind(now() - age)
    .execute(app.db.pool())
    .await
    .unwrap();
}

async fn seed_round(
    app: &TestApp,
    id: &str,
    application_id: &str,
    outcome: InterviewRoundOutcome,
    scheduled_in: Option<TimeDelta>,
) {
    app.container
        .interview_round_repository
        .create(CreateInterviewRoundData {
            id: id.to_string(),
            application_id: application_id.to_string(),
            r#type: InterviewRoundType::Phone,
            scheduled_at: scheduled_in.map(|offset| now() + offset),
            completed_at: None,
            interviewer_name: Some("Secret Interviewer".to_string()),
            notes: None,
            outcome: Some(outcome),
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn creates_a_link_returning_the_raw_token_once_and_storing_only_its_hash() {
    let (app, token) = app_with_owner().await;

    let created = create(&app, &token, "Mentor").await;

    let raw = created["token"].as_str().unwrap();
    let body = raw.strip_prefix("jfsl_").expect("the jfsl_ prefix");
    assert_eq!(body.len(), 48, "24 random bytes in hex");
    assert!(body.bytes().all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f')));
    assert_eq!(created["name"], "Mentor");
    assert_eq!(created["id"].as_str().unwrap().len(), 21);

    let stored_hash: String =
        sqlx::query_scalar(r#"SELECT "tokenHash" FROM "ShareLink" WHERE "id" = $1"#)
            .bind(created["id"].as_str().unwrap())
            .fetch_one(app.db.pool())
            .await
            .unwrap();
    assert_eq!(stored_hash, hex::encode(Sha256::digest(raw.as_bytes())));

    let listed = app.graphql(LIST, json!({}), Auth::Bearer(&token)).await;
    let listed = listed.data("shareLinks");
    assert_eq!(listed[0]["id"], created["id"]);
    assert_eq!(listed[0]["lastUsedAt"], Value::Null);
    assert!(!listed.to_string().contains(body));
}

#[tokio::test]
async fn lists_only_the_users_links_newest_first() {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    let stranger = app.access_token("stranger");
    create(&app, &token, "first").await;
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    create(&app, &token, "second").await;
    create(&app, &stranger, "foreign").await;

    let response = app.graphql(LIST, json!({}), Auth::Bearer(&token)).await;

    let names: Vec<&str> = response
        .data("shareLinks")
        .as_array()
        .unwrap()
        .iter()
        .map(|link| link["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, vec!["second", "first"]);
}

#[tokio::test]
async fn deletes_a_link_which_then_shows_nothing() {
    let (app, token) = app_with_owner().await;
    let created = create(&app, &token, "Mentor").await;
    let raw = created["token"].clone();

    let deleted = app.graphql(DELETE, json!({ "id": created["id"] }), Auth::Bearer(&token)).await;
    assert_eq!(deleted.data("deleteShareLink"), &Value::Bool(true));

    let summary = app.graphql(SUMMARY, json!({ "token": raw }), Auth::None).await;
    assert_eq!(summary.data("sharedSummary"), &Value::Null);

    let again = app.graphql(DELETE, json!({ "id": created["id"] }), Auth::Bearer(&token)).await;
    assert_eq!(again.error_code(), "NOT_FOUND");
    assert_eq!(again.error_message(), "Share link not found");
}

#[tokio::test]
async fn someone_elses_link_is_not_found_and_kept() {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    let stranger = app.access_token("stranger");
    let created = create(&app, &token, "Mentor").await;

    let response =
        app.graphql(DELETE, json!({ "id": created["id"] }), Auth::Bearer(&stranger)).await;

    assert_eq!(response.error_code(), "NOT_FOUND");
    assert_eq!(response.error_message(), "Share link not found");
    assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 404);
    assert_eq!(count(&app).await, 1);
}

#[tokio::test]
async fn managing_links_needs_a_signed_in_user() {
    let (app, _token) = app_with_owner().await;
    let requests =
        [(LIST, json!({})), (CREATE, json!({ "name": "x" })), (DELETE, json!({ "id": "x" }))];

    for (query, variables) in requests {
        let response = app.graphql(query, variables, Auth::None).await;
        assert_eq!(response.error_code(), "UNAUTHORIZED", "{query}");
    }
    assert_eq!(count(&app).await, 0);
}

mod shared_summary {
    use super::*;

    #[tokio::test]
    async fn an_anonymous_caller_sees_aggregates_only_and_the_use_is_recorded() {
        let (app, token) = app_with_owner().await;
        seed_user(&app.db, "stranger").await;
        let day = TimeDelta::days(1);
        seed_application(&app, "a1", "owner", "applied", day).await;
        seed_application(&app, "a2", "owner", "applied", day * 30).await;
        seed_application(&app, "a3", "owner", "interviewing", day * 6).await;
        seed_application(&app, "a4", "owner", "rejected", day * 8).await;
        seed_application(&app, "foreign", "stranger", "offered", day).await;
        seed_round(&app, "upcoming", "a3", InterviewRoundOutcome::Pending, Some(day)).await;
        seed_round(&app, "past", "a3", InterviewRoundOutcome::Pending, Some(-day)).await;
        seed_round(&app, "unscheduled", "a3", InterviewRoundOutcome::Pending, None).await;
        seed_round(&app, "decided", "a1", InterviewRoundOutcome::Passed, Some(day)).await;
        seed_round(&app, "foreign-round", "foreign", InterviewRoundOutcome::Pending, Some(day))
            .await;
        let created = create(&app, &token, "Mentor").await;

        let response = app.graphql(SUMMARY, json!({ "token": created["token"] }), Auth::None).await;
        let summary = response.data("sharedSummary");

        assert_eq!(
            summary["statusCounts"],
            json!([
                { "status": "draft", "count": 0 },
                { "status": "applied", "count": 2 },
                { "status": "interviewing", "count": 1 },
                { "status": "offered", "count": 0 },
                { "status": "accepted", "count": 0 },
                { "status": "rejected", "count": 1 },
                { "status": "withdrawn", "count": 0 },
            ])
        );
        assert_eq!(summary["totalApplications"], 4);
        assert_eq!(summary["totalInterviews"], 4);
        assert_eq!(summary["upcomingInterviews"], 1);
        assert_eq!(summary["applicationsUpdatedLast7Days"], 2);
        assert!(summary["generatedAt"].as_str().unwrap().ends_with('Z'));
        assert!(!response.body.to_string().contains("Secret"));

        let listed = app.graphql(LIST, json!({}), Auth::Bearer(&token)).await;
        assert!(listed.data("shareLinks")[0]["lastUsedAt"].is_string());
    }

    #[tokio::test]
    async fn trashed_applications_are_not_counted() {
        let (app, token) = app_with_owner().await;
        seed_application(&app, "live", "owner", "applied", TimeDelta::zero()).await;
        seed_application(&app, "trashed", "owner", "applied", TimeDelta::zero()).await;
        sqlx::query(r#"UPDATE "JobApplication" SET "deletedAt" = $1 WHERE "id" = 'trashed'"#)
            .bind(now())
            .execute(app.db.pool())
            .await
            .unwrap();
        let created = create(&app, &token, "Mentor").await;

        let response = app.graphql(SUMMARY, json!({ "token": created["token"] }), Auth::None).await;

        assert_eq!(response.data("sharedSummary")["totalApplications"], 1);
    }

    #[tokio::test]
    async fn an_unknown_token_is_null_not_an_error() {
        let (app, _token) = app_with_owner().await;

        for token in ["jfsl_unknown", "", "trakwyn_abc"] {
            let response = app.graphql(SUMMARY, json!({ "token": token }), Auth::None).await;
            assert_eq!(response.data("sharedSummary"), &Value::Null, "{token}");
        }
    }

    #[tokio::test]
    async fn a_link_minted_and_hashed_by_apps_api_opens_here() {
        let (app, _token) = app_with_owner().await;
        sqlx::query(
            r#"INSERT INTO "ShareLink" ("id", "userId", "name", "tokenHash", "createdAt")
               VALUES ('from-node', 'owner', 'seeded', $1, $2)"#,
        )
        .bind(NODE_TOKEN_HASH)
        .bind(now())
        .execute(app.db.pool())
        .await
        .unwrap();

        let response = app.graphql(SUMMARY, json!({ "token": NODE_RAW_TOKEN }), Auth::None).await;

        assert_eq!(response.data("sharedSummary")["totalApplications"], 0);
    }
}
