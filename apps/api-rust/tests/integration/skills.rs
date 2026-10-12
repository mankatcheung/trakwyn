//! Skills through the real GraphQL endpoint and a real database.

use serde_json::{json, Value};

use crate::common::{seed_user, Auth, TestApp};

const CREATE: &str = "mutation($input: CreateSkillInput!) {
    createSkill(input: $input) { id userId name category proficiency createdAt }
}";
const UPDATE: &str = "mutation($id: ID!, $input: UpdateSkillInput!) {
    updateSkill(id: $id, input: $input) { id name category proficiency }
}";
const LIST: &str = "{ skills { id name } }";
const DELETE: &str = "mutation($id: ID!) { deleteSkill(id: $id) }";

async fn app_with_owner() -> (TestApp, String) {
    let app = TestApp::start().await;
    seed_user(&app.db, "owner").await;
    let token = app.access_token("owner");
    (app, token)
}

async fn create(app: &TestApp, token: &str, input: Value) -> Value {
    app.graphql(CREATE, json!({ "input": input }), Auth::Bearer(token))
        .await
        .data("createSkill")
        .clone()
}

fn full_input() -> Value {
    json!({ "name": "Rust", "category": "Languages", "proficiency": "Advanced" })
}

async fn count(app: &TestApp) -> i64 {
    sqlx::query_scalar(r#"SELECT count(*) FROM "Skill""#).fetch_one(app.db.pool()).await.unwrap()
}

#[tokio::test]
async fn creates_a_skill_with_and_without_the_optional_fields() {
    let (app, token) = app_with_owner().await;

    let full = create(&app, &token, full_input()).await;
    assert_eq!(full["id"].as_str().unwrap().len(), 21);
    assert_eq!(full["userId"], "owner");
    assert_eq!(full["name"], "Rust");
    assert_eq!(full["category"], "Languages");
    assert_eq!(full["proficiency"], "Advanced");
    assert!(full["createdAt"].as_str().unwrap().ends_with('Z'));

    let minimal = create(&app, &token, json!({ "name": "Go", "category": null })).await;
    assert_eq!(minimal["category"], Value::Null);
    assert_eq!(minimal["proficiency"], Value::Null);
}

#[tokio::test]
async fn lists_the_users_skills_newest_first() {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    let stranger = app.access_token("stranger");
    for name in ["first", "second", "third"] {
        create(&app, &token, json!({ "name": name })).await;
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    create(&app, &stranger, json!({ "name": "foreign" })).await;

    let response = app.graphql(LIST, json!({}), Auth::Bearer(&token)).await;

    let names: Vec<&str> = response
        .data("skills")
        .as_array()
        .unwrap()
        .iter()
        .map(|skill| skill["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, vec!["third", "second", "first"]);
}

#[tokio::test]
async fn updates_only_what_is_given_and_null_clears_a_nullable_field() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, full_input()).await["id"].clone();

    let variables =
        json!({ "id": id, "input": { "proficiency": "Expert", "category": null, "name": null } });
    let response = app.graphql(UPDATE, variables, Auth::Bearer(&token)).await;
    let updated = response.data("updateSkill");

    assert_eq!(updated["proficiency"], "Expert");
    assert_eq!(updated["category"], Value::Null);
    // A null on the required column means "leave it".
    assert_eq!(updated["name"], "Rust");
}

#[tokio::test]
async fn an_update_that_sets_nothing_is_an_internal_error_as_in_the_original() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, full_input()).await["id"].clone();

    for input in [json!({}), json!({ "name": null })] {
        let response =
            app.graphql(UPDATE, json!({ "id": id, "input": input }), Auth::Bearer(&token)).await;
        assert_eq!(response.error_code(), "INTERNAL_ERROR");
        assert_eq!(response.error_message(), "Internal server error");
    }

    // Ownership is still checked first.
    let missing =
        app.graphql(UPDATE, json!({ "id": "missing", "input": {} }), Auth::Bearer(&token)).await;
    assert_eq!(missing.error_code(), "NOT_FOUND");
}

#[tokio::test]
async fn someone_elses_skill_is_not_found_for_update_and_delete() {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    let stranger = app.access_token("stranger");
    let id = create(&app, &token, full_input()).await["id"].clone();

    let update = app
        .graphql(
            UPDATE,
            json!({ "id": id, "input": { "name": "Hacked" } }),
            Auth::Bearer(&stranger),
        )
        .await;
    assert_eq!(update.error_code(), "NOT_FOUND");
    assert_eq!(update.error_message(), "Skill not found");
    assert_eq!(update.body["errors"][0]["extensions"]["statusCode"], 404);

    let delete = app.graphql(DELETE, json!({ "id": id }), Auth::Bearer(&stranger)).await;
    assert_eq!(delete.error_code(), "NOT_FOUND");
    assert_eq!(delete.error_message(), "Skill not found");
    assert_eq!(count(&app).await, 1);
}

#[tokio::test]
async fn deletes_a_skill_and_a_second_delete_is_not_found() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, full_input()).await["id"].clone();

    let deleted = app.graphql(DELETE, json!({ "id": id }), Auth::Bearer(&token)).await;
    assert_eq!(deleted.data("deleteSkill"), &Value::Bool(true));
    assert_eq!(count(&app).await, 0);

    let again = app.graphql(DELETE, json!({ "id": id }), Auth::Bearer(&token)).await;
    assert_eq!(again.error_code(), "NOT_FOUND");
}

#[tokio::test]
async fn every_operation_needs_a_signed_in_user() {
    let (app, _token) = app_with_owner().await;
    let requests = [
        (LIST, json!({})),
        (CREATE, json!({ "input": full_input() })),
        (UPDATE, json!({ "id": "x", "input": {} })),
        (DELETE, json!({ "id": "x" })),
    ];

    for (query, variables) in requests {
        let response = app.graphql(query, variables, Auth::None).await;
        assert_eq!(response.error_code(), "UNAUTHORIZED", "{query}");
    }
    assert_eq!(count(&app).await, 0);
}
