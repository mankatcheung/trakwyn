//! Education through the real GraphQL endpoint and a real database.

use serde_json::{json, Value};

use crate::common::{seed_user, Auth, TestApp};

const FIELDS: &str =
    "id userId institution degree field startDate endDate description createdAt updatedAt";

fn create_query() -> String {
    format!(
        "mutation($input: CreateEducationInput!) {{ createEducation(input: $input) {{ {FIELDS} }} }}"
    )
}

fn update_query() -> String {
    format!(
        "mutation($id: ID!, $input: UpdateEducationInput!) {{
            updateEducation(id: $id, input: $input) {{ {FIELDS} }}
        }}"
    )
}

const LIST: &str = "{ educations { id institution startDate } }";
const DELETE: &str = "mutation($id: ID!) { deleteEducation(id: $id) }";

async fn app_with_owner() -> (TestApp, String) {
    let app = TestApp::start().await;
    seed_user(&app.db, "owner").await;
    let token = app.access_token("owner");
    (app, token)
}

async fn create(app: &TestApp, token: &str, input: Value) -> Value {
    app.graphql(&create_query(), json!({ "input": input }), Auth::Bearer(token))
        .await
        .data("createEducation")
        .clone()
}

fn full_input() -> Value {
    json!({
        "institution": "MIT",
        "degree": "BSc",
        "field": "Physics",
        "startDate": "2010-09-01",
        "endDate": "2014-06-15",
        "description": "Thesis on optics",
    })
}

async fn count(app: &TestApp) -> i64 {
    sqlx::query_scalar(r#"SELECT count(*) FROM "Education""#)
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
    assert_eq!(created["institution"], "MIT");
    assert_eq!(created["degree"], "BSc");
    assert_eq!(created["field"], "Physics");
    assert_eq!(created["startDate"], "2010-09-01T00:00:00.000Z");
    assert_eq!(created["endDate"], "2014-06-15T00:00:00.000Z");
    assert_eq!(created["description"], "Thesis on optics");
    assert_eq!(created["createdAt"], created["updatedAt"]);
}

#[tokio::test]
async fn omitted_optionals_are_null_and_an_empty_end_date_is_no_end_date() {
    let (app, token) = app_with_owner().await;

    let created = create(
        &app,
        &token,
        json!({ "institution": "MIT", "startDate": "2010-09-01", "endDate": "" }),
    )
    .await;

    assert_eq!(created["degree"], Value::Null);
    assert_eq!(created["field"], Value::Null);
    assert_eq!(created["endDate"], Value::Null);
    assert_eq!(created["description"], Value::Null);
}

#[tokio::test]
async fn an_unreadable_date_is_an_internal_error_and_stores_nothing() {
    let (app, token) = app_with_owner().await;
    let input = json!({ "institution": "MIT", "startDate": "2010-09-01", "endDate": "later" });

    let response =
        app.graphql(&create_query(), json!({ "input": input }), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "INTERNAL_ERROR");
    assert_eq!(response.error_message(), "Internal server error");
    assert_eq!(count(&app).await, 0);
}

#[tokio::test]
async fn lists_the_users_entries_latest_start_first() {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    let stranger = app.access_token("stranger");
    for (institution, start) in
        [("Old", "2001-01-01"), ("New", "2015-01-01"), ("Mid", "2008-01-01")]
    {
        create(&app, &token, json!({ "institution": institution, "startDate": start })).await;
    }
    create(&app, &stranger, json!({ "institution": "Foreign", "startDate": "2020-01-01" })).await;

    let response = app.graphql(LIST, json!({}), Auth::Bearer(&token)).await;

    let institutions: Vec<&str> = response
        .data("educations")
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| entry["institution"].as_str().unwrap())
        .collect();
    assert_eq!(institutions, vec!["New", "Mid", "Old"]);
}

#[tokio::test]
async fn updates_only_what_is_given_and_null_clears_a_nullable_field() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, full_input()).await["id"].clone();

    let variables = json!({
        "id": id,
        "input": {
            "degree": "MSc", "field": null, "endDate": null, "institution": null, "startDate": "",
        },
    });
    let response = app.graphql(&update_query(), variables, Auth::Bearer(&token)).await;
    let updated = response.data("updateEducation");

    assert_eq!(updated["degree"], "MSc");
    assert_eq!(updated["field"], Value::Null);
    assert_eq!(updated["endDate"], Value::Null);
    assert_eq!(updated["institution"], "MIT");
    assert_eq!(updated["startDate"], "2010-09-01T00:00:00.000Z");
    assert_eq!(updated["description"], "Thesis on optics");
}

#[tokio::test]
async fn an_update_with_an_unreadable_date_checks_ownership_first() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, full_input()).await["id"].clone();
    let bad = json!({ "endDate": "later" });

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
            json!({ "id": id, "input": { "degree": "Hacked" } }),
            Auth::Bearer(&stranger),
        )
        .await;
    assert_eq!(update.error_code(), "NOT_FOUND");
    assert_eq!(update.error_message(), "Education not found");
    assert_eq!(update.body["errors"][0]["extensions"]["statusCode"], 404);

    let delete = app.graphql(DELETE, json!({ "id": id }), Auth::Bearer(&stranger)).await;
    assert_eq!(delete.error_code(), "NOT_FOUND");
    assert_eq!(delete.error_message(), "Education not found");
    assert_eq!(count(&app).await, 1);
}

#[tokio::test]
async fn deletes_an_entry_and_a_second_delete_is_not_found() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, full_input()).await["id"].clone();

    let deleted = app.graphql(DELETE, json!({ "id": id }), Auth::Bearer(&token)).await;
    assert_eq!(deleted.data("deleteEducation"), &Value::Bool(true));
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
    }
    assert_eq!(count(&app).await, 0);
}
