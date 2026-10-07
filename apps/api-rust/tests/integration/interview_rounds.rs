//! Interview rounds and their analytics through the real GraphQL endpoint and
//! a real database.

use serde_json::{json, Value};

use crate::common::{seed_application, seed_user, Auth, TestApp};

const FIELDS: &str =
    "id applicationId type scheduledAt completedAt interviewerName notes outcome createdAt updatedAt";
const LIST: &str = "query($applicationId: ID!) {
    interviewRounds(applicationId: $applicationId) { id type outcome }
}";
const DELETE: &str = "mutation($id: ID!) { deleteInterviewRound(id: $id) }";
const ANALYTICS: &str = "query {
    interviewRoundAnalytics {
        byType { type passed failed pending cancelled }
        roundsToOffer { average median sampleSize }
        roundsToRejection { average median sampleSize }
    }
}";

fn create_query() -> String {
    format!(
        "mutation($input: CreateInterviewRoundInput!) {{
            createInterviewRound(input: $input) {{ {FIELDS} }}
        }}"
    )
}

fn update_query() -> String {
    format!(
        "mutation($id: ID!, $input: UpdateInterviewRoundInput!) {{
            updateInterviewRound(id: $id, input: $input) {{ {FIELDS} }}
        }}"
    )
}

async fn app_with_owner() -> (TestApp, String) {
    let app = TestApp::start().await;
    seed_user(&app.db, "owner").await;
    seed_application(&app.db, "app-1", "owner").await;
    let token = app.access_token("owner");
    (app, token)
}

async fn create(app: &TestApp, token: &str, input: Value) -> Value {
    app.graphql(&create_query(), json!({ "input": input }), Auth::Bearer(token))
        .await
        .data("createInterviewRound")
        .clone()
}

async fn update(app: &TestApp, token: &str, id: &Value, input: Value) -> Value {
    app.graphql(&update_query(), json!({ "id": id, "input": input }), Auth::Bearer(token))
        .await
        .data("updateInterviewRound")
        .clone()
}

async fn set_status(app: &TestApp, application_id: &str, status: &str) {
    sqlx::query(r#"UPDATE "JobApplication" SET "status" = $2 WHERE "id" = $1"#)
        .bind(application_id)
        .bind(status)
        .execute(app.db.pool())
        .await
        .unwrap();
}

#[tokio::test]
async fn creates_a_round_with_the_defaults_and_records_the_activity() {
    let (app, token) = app_with_owner().await;

    let round = create(&app, &token, json!({ "applicationId": "app-1" })).await;

    assert_eq!(round["id"].as_str().unwrap().len(), 21);
    assert_eq!(round["applicationId"], "app-1");
    assert_eq!(round["type"], "other");
    assert_eq!(round["outcome"], "pending");
    assert_eq!(round["scheduledAt"], Value::Null);
    assert_eq!(round["completedAt"], Value::Null);
    assert_eq!(round["interviewerName"], Value::Null);
    assert_eq!(round["notes"], Value::Null);
    assert_eq!(round["createdAt"], round["updatedAt"]);

    let (event_type, actor_id, payload): (String, String, String) = sqlx::query_as(
        r#"SELECT "eventType", "actorId", "payload" FROM "ActivityLog" WHERE "applicationId" = 'app-1'"#,
    )
    .fetch_one(app.db.pool())
    .await
    .unwrap();
    assert_eq!(event_type, "interview_added");
    assert_eq!(actor_id, "owner");
    assert_eq!(payload, format!(r#"{{"roundId":{},"type":"other"}}"#, round["id"]));
}

#[tokio::test]
async fn creates_a_round_with_every_field_named() {
    let (app, token) = app_with_owner().await;

    let round = create(
        &app,
        &token,
        json!({
            "applicationId": "app-1",
            "type": "technical",
            "scheduledAt": "2026-01-31T10:30:00+01:00",
            "completedAt": "2026-02-01",
            "interviewerName": "Sam",
            "notes": "System design",
            "outcome": "passed",
        }),
    )
    .await;

    assert_eq!(round["type"], "technical");
    assert_eq!(round["scheduledAt"], "2026-01-31T09:30:00.000Z");
    assert_eq!(round["completedAt"], "2026-02-01T00:00:00.000Z");
    assert_eq!(round["interviewerName"], "Sam");
    assert_eq!(round["notes"], "System design");
    assert_eq!(round["outcome"], "passed");
}

#[tokio::test]
async fn an_empty_timestamp_on_create_is_not_set() {
    let (app, token) = app_with_owner().await;

    let round = create(&app, &token, json!({ "applicationId": "app-1", "scheduledAt": "" })).await;

    assert_eq!(round["scheduledAt"], Value::Null);
}

#[tokio::test]
async fn an_unreadable_timestamp_is_an_internal_error_and_stores_nothing() {
    let (app, token) = app_with_owner().await;

    let response = app
        .graphql(
            &create_query(),
            json!({ "input": { "applicationId": "app-1", "scheduledAt": "next tuesday" } }),
            Auth::Bearer(&token),
        )
        .await;

    assert_eq!(response.error_code(), "INTERNAL_ERROR");
    assert_eq!(response.error_message(), "Internal server error");
    assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 500);
    let listed = app.graphql(LIST, json!({ "applicationId": "app-1" }), Auth::Bearer(&token)).await;
    assert_eq!(listed.data("interviewRounds"), &json!([]));
}

#[tokio::test]
async fn an_unknown_type_is_refused_by_the_schema() {
    let (app, token) = app_with_owner().await;

    let response = app
        .graphql(
            &create_query(),
            json!({ "input": { "applicationId": "app-1", "type": "lunch" } }),
            Auth::Bearer(&token),
        )
        .await;

    assert!(response.body.get("errors").is_some());
    assert_eq!(response.body["data"], Value::Null);
}

#[tokio::test]
async fn lists_rounds_oldest_first() {
    let (app, token) = app_with_owner().await;
    create(&app, &token, json!({ "applicationId": "app-1", "type": "phone" })).await;
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    create(&app, &token, json!({ "applicationId": "app-1", "type": "onsite" })).await;

    let response =
        app.graphql(LIST, json!({ "applicationId": "app-1" }), Auth::Bearer(&token)).await;

    let types: Vec<&str> = response
        .data("interviewRounds")
        .as_array()
        .unwrap()
        .iter()
        .map(|round| round["type"].as_str().unwrap())
        .collect();
    assert_eq!(types, vec!["phone", "onsite"]);
}

#[tokio::test]
async fn an_update_writes_named_fields_and_leaves_the_rest() {
    let (app, token) = app_with_owner().await;
    let created = create(
        &app,
        &token,
        json!({
            "applicationId": "app-1",
            "type": "phone",
            "scheduledAt": "2026-01-31T09:30:00.000Z",
            "interviewerName": "Sam",
            "notes": "Intro call",
        }),
    )
    .await;

    let updated = update(
        &app,
        &token,
        &created["id"],
        json!({ "outcome": "passed", "completedAt": "2026-01-31T10:00:00Z" }),
    )
    .await;

    assert_eq!(updated["outcome"], "passed");
    assert_eq!(updated["completedAt"], "2026-01-31T10:00:00.000Z");
    assert_eq!(updated["type"], "phone");
    assert_eq!(updated["scheduledAt"], "2026-01-31T09:30:00.000Z");
    assert_eq!(updated["interviewerName"], "Sam");
    assert_eq!(updated["notes"], "Intro call");
}

#[tokio::test]
async fn an_update_clears_what_is_nulled_or_emptied_and_ignores_a_null_type_or_outcome() {
    let (app, token) = app_with_owner().await;
    let created = create(
        &app,
        &token,
        json!({
            "applicationId": "app-1",
            "type": "phone",
            "outcome": "failed",
            "scheduledAt": "2026-01-31T09:30:00.000Z",
            "completedAt": "2026-01-31T10:00:00.000Z",
            "interviewerName": "Sam",
            "notes": "Intro call",
        }),
    )
    .await;

    let updated = update(
        &app,
        &token,
        &created["id"],
        json!({
            "type": null,
            "outcome": null,
            "scheduledAt": null,
            "completedAt": "",
            "interviewerName": null,
            "notes": "",
        }),
    )
    .await;

    assert_eq!(updated["type"], "phone");
    assert_eq!(updated["outcome"], "failed");
    assert_eq!(updated["scheduledAt"], Value::Null);
    assert_eq!(updated["completedAt"], Value::Null);
    assert_eq!(updated["interviewerName"], Value::Null);
    // An empty string is a value, not a request to clear.
    assert_eq!(updated["notes"], "");
}

#[tokio::test]
async fn deletes_a_round() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, json!({ "applicationId": "app-1" })).await["id"].clone();

    let deleted = app.graphql(DELETE, json!({ "id": id }), Auth::Bearer(&token)).await;
    assert_eq!(deleted.data("deleteInterviewRound"), &Value::Bool(true));

    let listed = app.graphql(LIST, json!({ "applicationId": "app-1" }), Auth::Bearer(&token)).await;
    assert_eq!(listed.data("interviewRounds"), &json!([]));
}

#[tokio::test]
async fn every_operation_is_unauthorized_without_a_user() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, json!({ "applicationId": "app-1" })).await["id"].clone();

    let requests = [
        (LIST.to_string(), json!({ "applicationId": "app-1" }), "interviewRounds"),
        (ANALYTICS.to_string(), json!({}), "interviewRoundAnalytics"),
        (create_query(), json!({ "input": { "applicationId": "app-1" } }), "createInterviewRound"),
        (update_query(), json!({ "id": id, "input": {} }), "updateInterviewRound"),
        (DELETE.to_string(), json!({ "id": id }), "deleteInterviewRound"),
    ];
    for (query, variables, field) in requests {
        let response = app.graphql(&query, variables, Auth::None).await;
        assert_eq!(response.error_code(), "UNAUTHORIZED", "{field}");
        assert_eq!(response.body["data"][field], Value::Null, "{field}");
    }
}

#[tokio::test]
async fn someone_elses_application_and_round_are_forbidden() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, json!({ "applicationId": "app-1" })).await["id"].clone();
    seed_user(&app.db, "stranger").await;
    let stranger = app.access_token("stranger");

    let requests = [
        (LIST.to_string(), json!({ "applicationId": "app-1" })),
        (create_query(), json!({ "input": { "applicationId": "app-1" } })),
        (update_query(), json!({ "id": id, "input": { "outcome": "passed" } })),
        (DELETE.to_string(), json!({ "id": id })),
    ];
    for (query, variables) in requests {
        let response = app.graphql(&query, variables, Auth::Bearer(&stranger)).await;
        assert_eq!(response.error_code(), "FORBIDDEN", "{query}");
        assert_eq!(response.error_message(), "Forbidden", "{query}");
    }

    let listed = app.graphql(LIST, json!({ "applicationId": "app-1" }), Auth::Bearer(&token)).await;
    assert_eq!(listed.data("interviewRounds")[0]["outcome"], "pending");
}

#[tokio::test]
async fn an_unknown_application_or_round_is_not_found() {
    let (app, token) = app_with_owner().await;

    let requests = [
        (LIST.to_string(), json!({ "applicationId": "missing" }), "Application not found"),
        (
            create_query(),
            json!({ "input": { "applicationId": "missing" } }),
            "Application not found",
        ),
        (update_query(), json!({ "id": "missing", "input": {} }), "Interview round not found"),
        (DELETE.to_string(), json!({ "id": "missing" }), "Interview round not found"),
    ];
    for (query, variables, message) in requests {
        let response = app.graphql(&query, variables, Auth::Bearer(&token)).await;
        assert_eq!(response.error_code(), "NOT_FOUND", "{query}");
        assert_eq!(response.error_message(), message);
    }
}

#[tokio::test]
async fn analytics_are_empty_for_a_user_with_no_rounds() {
    let (app, token) = app_with_owner().await;

    let response = app.graphql(ANALYTICS, json!({}), Auth::Bearer(&token)).await;

    let empty = json!({ "average": null, "median": null, "sampleSize": 0 });
    assert_eq!(
        response.data("interviewRoundAnalytics"),
        &json!({ "byType": [], "roundsToOffer": empty, "roundsToRejection": empty })
    );
}

#[tokio::test]
async fn analytics_count_outcomes_by_type_and_rounds_to_each_terminal_state() {
    let (app, token) = app_with_owner().await;
    for (id, status) in [
        ("app-1", "offered"),
        ("app-2", "accepted"),
        ("app-3", "rejected"),
        ("app-4", "withdrawn"),
        ("app-5", "offered"),
    ] {
        if id != "app-1" {
            seed_application(&app.db, id, "owner").await;
        }
        set_status(&app, id, status).await;
    }
    seed_user(&app.db, "stranger").await;
    seed_application(&app.db, "app-foreign", "stranger").await;
    set_status(&app, "app-foreign", "rejected").await;
    let stranger = app.access_token("stranger");
    create(&app, &stranger, json!({ "applicationId": "app-foreign", "type": "hr" })).await;

    let rounds = [
        ("app-1", "phone", "passed"),
        ("app-1", "technical", "passed"),
        ("app-1", "onsite", "passed"),
        ("app-2", "phone", "passed"),
        ("app-2", "technical", "cancelled"),
        ("app-3", "phone", "failed"),
        ("app-4", "phone", "pending"),
    ];
    for (application_id, round_type, outcome) in rounds {
        let input =
            json!({ "applicationId": application_id, "type": round_type, "outcome": outcome });
        create(&app, &token, input).await;
    }

    let response = app.graphql(ANALYTICS, json!({}), Auth::Bearer(&token)).await;

    // app-5 was offered with no rounds, so it is not a sample; app-4 was
    // withdrawn, so its round counts by type only.
    assert_eq!(
        response.data("interviewRoundAnalytics"),
        &json!({
            "byType": [
                { "type": "phone", "passed": 2, "failed": 1, "pending": 1, "cancelled": 0 },
                { "type": "technical", "passed": 1, "failed": 0, "pending": 0, "cancelled": 1 },
                { "type": "onsite", "passed": 1, "failed": 0, "pending": 0, "cancelled": 0 },
            ],
            "roundsToOffer": { "average": 2.5, "median": 2.5, "sampleSize": 2 },
            "roundsToRejection": { "average": 1.0, "median": 1.0, "sampleSize": 1 },
        })
    );
}
