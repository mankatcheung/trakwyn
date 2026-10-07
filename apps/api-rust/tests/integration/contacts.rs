//! Contacts through the real GraphQL endpoint and a real database.

use serde_json::{json, Value};

use crate::common::{seed_application, seed_user, Auth, TestApp};

const FIELDS: &str = "id applicationId name role email phone linkedinUrl notes createdAt updatedAt";
const LIST: &str =
    "query($applicationId: ID!) { contacts(applicationId: $applicationId) { id name } }";
const DELETE: &str = "mutation($id: ID!) { deleteContact(id: $id) }";

fn create_query() -> String {
    format!(
        "mutation($applicationId: ID!, $name: String!, $role: String, $email: String,
                  $phone: String, $linkedinUrl: String, $notes: String) {{
            createContact(applicationId: $applicationId, name: $name, role: $role, email: $email,
                          phone: $phone, linkedinUrl: $linkedinUrl, notes: $notes) {{ {FIELDS} }}
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

async fn create(app: &TestApp, token: &str, name: &str) -> Value {
    let variables = json!({
        "applicationId": "app-1",
        "name": name,
        "role": "Recruiter",
        "email": "jane@example.com",
    });
    app.graphql(&create_query(), variables, Auth::Bearer(token)).await.data("createContact").clone()
}

async fn stranger_token(app: &TestApp) -> String {
    seed_user(&app.db, "stranger").await;
    app.access_token("stranger")
}

#[tokio::test]
async fn creates_a_contact_with_unnamed_fields_null() {
    let (app, token) = app_with_owner().await;

    let contact = create(&app, &token, "Jane Doe").await;

    assert_eq!(contact["id"].as_str().unwrap().len(), 21);
    assert_eq!(contact["applicationId"], "app-1");
    assert_eq!(contact["name"], "Jane Doe");
    assert_eq!(contact["role"], "Recruiter");
    assert_eq!(contact["email"], "jane@example.com");
    assert_eq!(contact["phone"], Value::Null);
    assert_eq!(contact["linkedinUrl"], Value::Null);
    assert_eq!(contact["notes"], Value::Null);
    assert_eq!(contact["createdAt"].as_str().unwrap().len(), 24);
    assert_eq!(contact["createdAt"], contact["updatedAt"]);
}

#[tokio::test]
async fn lists_contacts_oldest_first() {
    let (app, token) = app_with_owner().await;
    create(&app, &token, "first").await;
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    create(&app, &token, "second").await;

    let response =
        app.graphql(LIST, json!({ "applicationId": "app-1" }), Auth::Bearer(&token)).await;

    let names: Vec<&str> = response
        .data("contacts")
        .as_array()
        .unwrap()
        .iter()
        .map(|contact| contact["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, vec!["first", "second"]);
}

#[tokio::test]
async fn an_update_writes_named_fields_clears_nulled_ones_and_leaves_the_rest() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, "Jane Doe").await["id"].clone();

    // `role: null` clears; `email` is left out; `name: null` reads as left out.
    let query = format!(
        "mutation($id: ID!) {{
            updateContact(id: $id, name: null, role: null, phone: \"555-0100\") {{ {FIELDS} }}
        }}"
    );
    let response = app.graphql(&query, json!({ "id": id }), Auth::Bearer(&token)).await;

    let contact = response.data("updateContact");
    assert_eq!(contact["name"], "Jane Doe");
    assert_eq!(contact["role"], Value::Null);
    assert_eq!(contact["phone"], "555-0100");
    assert_eq!(contact["email"], "jane@example.com");
}

#[tokio::test]
async fn an_update_renames_a_contact() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, "Jane Doe").await["id"].clone();

    let query =
        "mutation($id: ID!, $name: String) { updateContact(id: $id, name: $name) { name role } }";
    let response =
        app.graphql(query, json!({ "id": id, "name": "Janet" }), Auth::Bearer(&token)).await;

    assert_eq!(response.data("updateContact"), &json!({ "name": "Janet", "role": "Recruiter" }));
}

#[tokio::test]
async fn deletes_a_contact() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, "Jane Doe").await["id"].clone();

    let deleted = app.graphql(DELETE, json!({ "id": id }), Auth::Bearer(&token)).await;
    assert_eq!(deleted.data("deleteContact"), &Value::Bool(true));

    let listed = app.graphql(LIST, json!({ "applicationId": "app-1" }), Auth::Bearer(&token)).await;
    assert_eq!(listed.data("contacts"), &json!([]));
}

#[tokio::test]
async fn every_operation_is_unauthorized_without_a_user() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, "Jane Doe").await["id"].clone();

    let update = "mutation($id: ID!) { updateContact(id: $id, name: \"x\") { id } }";
    let requests = [
        (LIST.to_string(), json!({ "applicationId": "app-1" }), "contacts"),
        (create_query(), json!({ "applicationId": "app-1", "name": "x" }), "createContact"),
        (update.to_string(), json!({ "id": id }), "updateContact"),
        (DELETE.to_string(), json!({ "id": id }), "deleteContact"),
    ];
    for (query, variables, field) in requests {
        let response = app.graphql(&query, variables, Auth::None).await;
        assert_eq!(response.error_code(), "UNAUTHORIZED", "{field}");
        assert_eq!(response.error_message(), "Unauthorized", "{field}");
        assert_eq!(response.body["data"][field], Value::Null, "{field}");
    }
}

#[tokio::test]
async fn someone_elses_application_and_contact_are_forbidden() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, "Jane Doe").await["id"].clone();
    let stranger = stranger_token(&app).await;

    let update = "mutation($id: ID!) { updateContact(id: $id, name: \"x\") { id } }";
    let requests = [
        (LIST.to_string(), json!({ "applicationId": "app-1" })),
        (create_query(), json!({ "applicationId": "app-1", "name": "x" })),
        (update.to_string(), json!({ "id": id })),
        (DELETE.to_string(), json!({ "id": id })),
    ];
    for (query, variables) in requests {
        let response = app.graphql(&query, variables, Auth::Bearer(&stranger)).await;
        assert_eq!(response.error_code(), "FORBIDDEN", "{query}");
        assert_eq!(response.error_message(), "Forbidden", "{query}");
        assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 403);
    }

    let listed = app.graphql(LIST, json!({ "applicationId": "app-1" }), Auth::Bearer(&token)).await;
    assert_eq!(listed.data("contacts")[0]["name"], "Jane Doe");
}

#[tokio::test]
async fn an_unknown_application_or_contact_is_not_found() {
    let (app, token) = app_with_owner().await;

    let update = "mutation($id: ID!) { updateContact(id: $id, name: \"x\") { id } }";
    let requests = [
        (LIST.to_string(), json!({ "applicationId": "missing" }), "Application not found"),
        (
            create_query(),
            json!({ "applicationId": "missing", "name": "x" }),
            "Application not found",
        ),
        (update.to_string(), json!({ "id": "missing" }), "Contact not found"),
        (DELETE.to_string(), json!({ "id": "missing" }), "Contact not found"),
    ];
    for (query, variables, message) in requests {
        let response = app.graphql(&query, variables, Auth::Bearer(&token)).await;
        assert_eq!(response.error_code(), "NOT_FOUND", "{query}");
        assert_eq!(response.error_message(), message);
        assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 404);
    }
}

#[tokio::test]
async fn a_contact_on_a_trashed_application_is_out_of_reach() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token, "Jane Doe").await["id"].clone();
    sqlx::query(r#"UPDATE "JobApplication" SET "deletedAt" = now() WHERE "id" = 'app-1'"#)
        .execute(app.db.pool())
        .await
        .unwrap();

    let listed = app.graphql(LIST, json!({ "applicationId": "app-1" }), Auth::Bearer(&token)).await;
    assert_eq!(listed.error_code(), "NOT_FOUND");

    let deleted = app.graphql(DELETE, json!({ "id": id }), Auth::Bearer(&token)).await;
    assert_eq!(deleted.error_code(), "FORBIDDEN");
}

#[tokio::test]
async fn a_contact_needs_a_name() {
    let (app, token) = app_with_owner().await;

    let query = "mutation { createContact(applicationId: \"app-1\") { id } }";
    let response = app.graphql(query, json!({}), Auth::Bearer(&token)).await;

    assert!(response.body["errors"][0]["message"].as_str().unwrap().contains("name"));
    assert_eq!(response.body["data"], Value::Null);
}
