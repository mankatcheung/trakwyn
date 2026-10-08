//! Work experience through the real GraphQL endpoint and a real database.

use serde_json::{json, Value};

use crate::common::{seed_user, Auth, TestApp};

const FIELDS: &str =
    "id userId company title location startDate endDate description createdAt updatedAt";

fn create_query() -> String {
    format!(
        "mutation($input: CreateWorkExperienceInput!) {{ createWorkExperience(input: $input) {{ {FIELDS} }} }}"
    )
}

fn update_query() -> String {
    format!(
        "mutation($id: ID!, $input: UpdateWorkExperienceInput!) {{
            updateWorkExperience(id: $id, input: $input) {{ {FIELDS} }}
        }}"
    )
}

const LIST: &str = "{ workExperiences { id company startDate } }";
const DELETE: &str = "mutation($id: ID!) { deleteWorkExperience(id: $id) }";

async fn app_with_owner() -> (TestApp, String) {
    let app = TestApp::start().await;
    seed_user(&app.db, "owner").await;
    let token = app.access_token("owner");
    (app, token)
}

async fn create(app: &TestApp, token: &str, input: Value) -> Value {
    app.graphql(&create_query(), json!({ "input": input }), Auth::Bearer(token))
        .await
        .data("createWorkExperience")
        .clone()
}

fn full_input() -> Value {
    json!({
        "company": "Acme",
        "title": "Engineer",
        "location": "Remote",
        "startDate": "2020-03-01",
        "endDate": "2022-06-30T12:00:00.000Z",
        "description": "Built things",
    })
}

async fn count(app: &TestApp) -> i64 {
    sqlx::query_scalar(r#"SELECT count(*) FROM "WorkExperience""#)
        .fetch_one(app.db.pool())
        .await
        .unwrap()
}

#[tokio::test]
async fn creates_an_entry_with_every_field() {
    let (app, token) = app_with_owner().await;

    let created = create(&app, &token, full_input()).await;

    assert_eq!(created["id"].as_str().unwrap().len(), 21);
    assert_eq!(created["userId"], "owner");
    assert_eq!(created["company"], "Acme");
    assert_eq!(created["title"], "Engineer");
    assert_eq!(created["location"], "Remote");
    assert_eq!(created["startDate"], "2020-03-01T00:00:00.000Z");
    assert_eq!(created["endDate"], "2022-06-30T12:00:00.000Z");
    assert_eq!(created["description"], "Built things");
    assert_eq!(created["createdAt"], created["updatedAt"]);
}

#[tokio::test]
async fn omitted_null_and_empty_optionals_are_stored_as_the_original_stores_them() {
    let (app, token) = app_with_owner().await;

    let minimal = create(
        &app,
        &token,
        json!({ "company": "Acme", "title": "Engineer", "startDate": "2020-03-01" }),
    )
    .await;
    assert_eq!(minimal["location"], Value::Null);
    assert_eq!(minimal["endDate"], Value::Null);
    assert_eq!(minimal["description"], Value::Null);

    // An empty end date is "no end date"; an empty text field stays empty text.
    let empties = create(
        &app,
        &token,
        json!({
            "company": "Acme", "title": "Engineer", "startDate": "2020-03-01",
            "endDate": "", "location": "", "description": null,
        }),
    )
    .await;
    assert_eq!(empties["endDate"], Value::Null);
    assert_eq!(empties["location"], "");
    assert_eq!(empties["description"], Value::Null);
}

#[tokio::test]
async fn an_unreadable_start_date_is_an_internal_error_and_stores_nothing() {
    let (app, token) = app_with_owner().await;
    let input = json!({ "company": "Acme", "title": "Engineer", "startDate": "sometime" });

    let response =
        app.graphql(&create_query(), json!({ "input": input }), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "INTERNAL_ERROR");
    assert_eq!(response.error_message(), "Internal server error");
    assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 500);
    assert_eq!(count(&app).await, 0);
}

#[tokio::test]
async fn lists_the_users_entries_latest_start_first() {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    let stranger = app.access_token("stranger");
    for (company, start) in [("Old", "2015-01-01"), ("New", "2023-01-01"), ("Mid", "2019-01-01")] {
        create(&app, &token, json!({ "company": company, "title": "T", "startDate": start })).await;
    }
    create(
        &app,
        &stranger,
        json!({ "company": "Foreign", "title": "T", "startDate": "2024-01-01" }),
    )
    .await;

    let response = app.graphql(LIST, json!({}), Auth::Bearer(&token)).await;

    let companies: Vec<&str> = response
        .data("workExperiences")
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| entry["company"].as_str().unwrap())
        .collect();
    assert_eq!(companies, vec!["New", "Mid", "Old"]);
}

#[tokio::test]
async fn updates_only_what_is_given_and_null_clears_a_nullable_field() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, full_input()).await["id"].clone();

    let variables = json!({
        "id": id,
        "input": { "title": "Staff Engineer", "location": null, "endDate": null, "company": null },
    });
    let response = app.graphql(&update_query(), variables, Auth::Bearer(&token)).await;
    let updated = response.data("updateWorkExperience");

    assert_eq!(updated["title"], "Staff Engineer");
    assert_eq!(updated["location"], Value::Null);
    assert_eq!(updated["endDate"], Value::Null);
    // A null on a required column means "leave it".
    assert_eq!(updated["company"], "Acme");
    assert_eq!(updated["startDate"], "2020-03-01T00:00:00.000Z");
    assert_eq!(updated["description"], "Built things");
}

#[tokio::test]
async fn an_empty_date_string_on_update_leaves_the_date_alone() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, full_input()).await["id"].clone();

    let variables = json!({
        "id": id,
        "input": { "startDate": "", "endDate": "", "description": "" },
    });
    let response = app.graphql(&update_query(), variables, Auth::Bearer(&token)).await;
    let updated = response.data("updateWorkExperience");

    assert_eq!(updated["startDate"], "2020-03-01T00:00:00.000Z");
    assert_eq!(updated["endDate"], "2022-06-30T12:00:00.000Z");
    assert_eq!(updated["description"], "");

    let variables =
        json!({ "id": id, "input": { "startDate": "2021-01-01", "endDate": "2023-01" } });
    let response = app.graphql(&update_query(), variables, Auth::Bearer(&token)).await;
    let updated = response.data("updateWorkExperience");
    assert_eq!(updated["startDate"], "2021-01-01T00:00:00.000Z");
    assert_eq!(updated["endDate"], "2023-01-01T00:00:00.000Z");
}

#[tokio::test]
async fn an_update_with_an_unreadable_date_checks_ownership_first() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, full_input()).await["id"].clone();
    let bad = json!({ "startDate": "sometime" });

    let own =
        app.graphql(&update_query(), json!({ "id": id, "input": bad }), Auth::Bearer(&token)).await;
    assert_eq!(own.error_code(), "INTERNAL_ERROR");

    let missing = app
        .graphql(&update_query(), json!({ "id": "missing", "input": bad }), Auth::Bearer(&token))
        .await;
    assert_eq!(missing.error_code(), "NOT_FOUND");
}

#[tokio::test]
async fn someone_elses_entry_is_not_found_for_update_and_delete() {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    let stranger = app.access_token("stranger");
    let id = create(&app, &token, full_input()).await["id"].clone();

    let update = app
        .graphql(
            &update_query(),
            json!({ "id": id, "input": { "title": "Hacked" } }),
            Auth::Bearer(&stranger),
        )
        .await;
    assert_eq!(update.error_code(), "NOT_FOUND");
    assert_eq!(update.error_message(), "Work experience not found");
    assert_eq!(update.body["errors"][0]["extensions"]["statusCode"], 404);

    let delete = app.graphql(DELETE, json!({ "id": id }), Auth::Bearer(&stranger)).await;
    assert_eq!(delete.error_code(), "NOT_FOUND");
    assert_eq!(delete.error_message(), "Work experience not found");
    assert_eq!(count(&app).await, 1);
}

#[tokio::test]
async fn deletes_an_entry_and_a_second_delete_is_not_found() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, full_input()).await["id"].clone();

    let deleted = app.graphql(DELETE, json!({ "id": id }), Auth::Bearer(&token)).await;
    assert_eq!(deleted.data("deleteWorkExperience"), &Value::Bool(true));
    assert_eq!(count(&app).await, 0);

    let again = app.graphql(DELETE, json!({ "id": id }), Auth::Bearer(&token)).await;
    assert_eq!(again.error_code(), "NOT_FOUND");
}

#[tokio::test]
async fn every_operation_needs_a_signed_in_user() {
    let (app, _token) = app_with_owner().await;
    let requests = [
        (LIST.to_string(), json!({})),
        (create_query(), json!({ "input": full_input() })),
        (update_query(), json!({ "id": "x", "input": {} })),
        (DELETE.to_string(), json!({ "id": "x" })),
    ];

    for (query, variables) in requests {
        let response = app.graphql(&query, variables, Auth::None).await;
        assert_eq!(response.error_code(), "UNAUTHORIZED", "{query}");
        assert_eq!(response.error_message(), "Unauthorized");
    }
    assert_eq!(count(&app).await, 0);
}

#[tokio::test]
async fn a_missing_required_field_is_refused_by_the_schema() {
    let (app, token) = app_with_owner().await;

    let response = app
        .graphql(
            &create_query(),
            json!({ "input": { "company": "Acme", "startDate": "2020-01-01" } }),
            Auth::Bearer(&token),
        )
        .await;

    assert!(response.body["errors"].is_array(), "{}", response.body);
    assert_eq!(count(&app).await, 0);
}
