//! Applications through the real GraphQL endpoint and a real database:
//! create, read, list, page and update. Trash, bulk actions and the board
//! are in `applications_bulk.rs`.

use serde_json::{json, Value};

use crate::common::{seed_application, seed_user, Auth, TestApp};

const FIELDS: &str = "id userId company role status jobUrl location salaryRange description \
    appliedAt starred source followUpAt tags boardPosition createdAt updatedAt deletedAt purgeAt \
    likelyGhosted";

pub fn create_mutation() -> String {
    format!("mutation($input: CreateApplicationInput!) {{ createApplication(input: $input) {{ {FIELDS} }} }}")
}

fn update_mutation() -> String {
    format!(
        "mutation($id: ID!, $input: UpdateApplicationInput!) {{
            updateApplication(id: $id, input: $input) {{ {FIELDS} }}
        }}"
    )
}

const LIST: &str =
    "query($status: ApplicationStatus) { applications(status: $status) { id status } }";
const PAGE: &str = "query($limit: Int, $cursor: String, $search: String, $starred: Boolean, \
    $status: ApplicationStatus, $likelyGhosted: Boolean) {
    applicationsPage(limit: $limit, cursor: $cursor, search: $search, starred: $starred, \
        status: $status, likelyGhosted: $likelyGhosted) {
        items { id } nextCursor hasNextPage
    }
}";
const DETAIL: &str = "query($id: ID!) {
    application(id: $id) {
        id deletedAt purgeAt
        sectionCounts { notes interviews contacts documents documentDrafts offers }
    }
}";

pub async fn app_with_owner() -> (TestApp, String) {
    let app = TestApp::start().await;
    seed_user(&app.db, "owner").await;
    let token = app.access_token("owner");
    (app, token)
}

pub async fn create(app: &TestApp, token: &str, input: Value) -> Value {
    app.graphql(&create_mutation(), json!({ "input": input }), Auth::Bearer(token))
        .await
        .data("createApplication")
        .clone()
}

pub async fn activity(app: &TestApp, application_id: &str) -> Vec<(String, String)> {
    sqlx::query_as(
        r#"SELECT "eventType", "payload" FROM "ActivityLog"
           WHERE "applicationId" = $1 ORDER BY "createdAt", "id""#,
    )
    .bind(application_id)
    .fetch_all(app.db.pool())
    .await
    .unwrap()
}

pub fn ids(applications: &Value) -> Vec<&str> {
    applications.as_array().unwrap().iter().map(|a| a["id"].as_str().unwrap()).collect()
}

#[tokio::test]
async fn creates_an_application_with_every_field() {
    let (app, token) = app_with_owner().await;

    let created = create(
        &app,
        &token,
        json!({
            "company": "Globex", "role": "Designer", "status": "applied",
            "jobUrl": "https://globex.example/jobs/1", "location": "Remote",
            "salaryRange": "100k", "description": "Design things", "starred": true,
            "source": "LinkedIn", "followUpAt": "2026-09-01T10:30:00.000Z",
            "tags": ["remote", "design"],
        }),
    )
    .await;

    assert_eq!(created["id"].as_str().unwrap().len(), 21);
    assert_eq!(created["userId"], "owner");
    assert_eq!(created["company"], "Globex");
    assert_eq!(created["role"], "Designer");
    assert_eq!(created["status"], "applied");
    assert_eq!(created["jobUrl"], "https://globex.example/jobs/1");
    assert_eq!(created["location"], "Remote");
    assert_eq!(created["salaryRange"], "100k");
    assert_eq!(created["description"], "Design things");
    assert_eq!(created["starred"], true);
    assert_eq!(created["source"], "LinkedIn");
    assert_eq!(created["followUpAt"], "2026-09-01T10:30:00.000Z");
    assert_eq!(created["tags"], json!(["remote", "design"]));
    assert_eq!(created["boardPosition"], 0);
    // Creating as "applied" does not stamp appliedAt; only an update does.
    assert_eq!(created["appliedAt"], Value::Null);
    assert_eq!(created["deletedAt"], Value::Null);
    assert_eq!(created["purgeAt"], Value::Null);
    assert_eq!(created["likelyGhosted"], false);
    assert_eq!(created["createdAt"], created["updatedAt"]);
    assert!(activity(&app, created["id"].as_str().unwrap()).await.is_empty());
}

#[tokio::test]
async fn create_defaults_to_a_draft_with_nothing_else_set() {
    let (app, token) = app_with_owner().await;

    let created =
        create(&app, &token, json!({ "company": "Acme", "role": "Engineer", "followUpAt": "" }))
            .await;

    assert_eq!(created["status"], "draft");
    assert_eq!(created["starred"], false);
    assert_eq!(created["tags"], json!([]));
    for field in ["jobUrl", "location", "salaryRange", "description", "source", "followUpAt"] {
        assert_eq!(created[field], Value::Null, "{field}");
    }
}

#[tokio::test]
async fn create_stops_at_the_quota() {
    let (app, token) = app_with_owner().await;
    sqlx::query(r#"UPDATE "User" SET "applicationCount" = 50 WHERE "id" = 'owner'"#)
        .execute(app.db.pool())
        .await
        .unwrap();

    let response = app
        .graphql(
            &create_mutation(),
            json!({ "input": { "company": "Acme", "role": "Engineer" } }),
            Auth::Bearer(&token),
        )
        .await;

    assert_eq!(response.error_code(), "QUOTA_EXCEEDED");
    assert_eq!(response.error_message(), "You have reached the maximum of 50 applications");
    assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 409);
}

#[tokio::test]
async fn an_unreadable_follow_up_date_is_a_server_error() {
    let (app, token) = app_with_owner().await;

    let response = app
        .graphql(
            &create_mutation(),
            json!({ "input": { "company": "Acme", "role": "Engineer", "followUpAt": "soon" } }),
            Auth::Bearer(&token),
        )
        .await;

    assert_eq!(response.error_code(), "INTERNAL_ERROR");
    assert_eq!(response.error_message(), "Internal server error");
}

#[tokio::test]
async fn a_request_missing_a_required_field_never_reaches_the_resolver() {
    let (app, token) = app_with_owner().await;

    let response = app
        .graphql(
            &create_mutation(),
            json!({ "input": { "company": "Acme" } }),
            Auth::Bearer(&token),
        )
        .await;

    assert!(response.body["errors"].as_array().is_some_and(|errors| !errors.is_empty()));
    let count: i64 = sqlx::query_scalar(r#"SELECT count(*) FROM "JobApplication""#)
        .fetch_one(app.db.pool())
        .await
        .unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn every_operation_needs_a_signed_in_user() {
    let (app, _token) = app_with_owner().await;
    let operations: [(&str, String, Value); 5] = [
        ("applications", LIST.to_string(), json!({})),
        ("applicationsPage", PAGE.to_string(), json!({})),
        ("application", DETAIL.to_string(), json!({ "id": "app-1" })),
        (
            "createApplication",
            create_mutation(),
            json!({ "input": { "company": "Acme", "role": "Engineer" } }),
        ),
        ("updateApplication", update_mutation(), json!({ "id": "app-1", "input": {} })),
    ];

    for (field, query, variables) in operations {
        let response = app.graphql(&query, variables, Auth::None).await;
        assert_eq!(response.error_code(), "UNAUTHORIZED", "{field}");
        assert_eq!(response.error_message(), "Unauthorized", "{field}");
        assert_eq!(response.body["data"][field], Value::Null, "{field}");
    }
}

#[tokio::test]
async fn lists_the_users_live_applications_newest_first_and_by_status() {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    seed_application(&app.db, "theirs", "stranger").await;
    let first = create(&app, &token, json!({ "company": "A", "role": "R" })).await;
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    let second =
        create(&app, &token, json!({ "company": "B", "role": "R", "status": "applied" })).await;

    let all = app.graphql(LIST, json!({}), Auth::Bearer(&token)).await;
    assert_eq!(
        ids(all.data("applications")),
        vec![second["id"].as_str().unwrap(), first["id"].as_str().unwrap()]
    );

    let applied = app.graphql(LIST, json!({ "status": "applied" }), Auth::Bearer(&token)).await;
    assert_eq!(ids(applied.data("applications")), vec![second["id"].as_str().unwrap()]);
}

#[tokio::test]
async fn pages_through_applications_with_a_cursor() {
    let (app, token) = app_with_owner().await;
    let mut created = Vec::new();
    for company in ["A", "B", "C"] {
        let application = create(&app, &token, json!({ "company": company, "role": "R" })).await;
        created.push(application["id"].as_str().unwrap().to_string());
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }

    let first = app.graphql(PAGE, json!({ "limit": 2 }), Auth::Bearer(&token)).await;
    let first = first.data("applicationsPage");
    assert_eq!(ids(&first["items"]), vec![created[2].as_str(), created[1].as_str()]);
    assert_eq!(first["hasNextPage"], true);
    assert_eq!(first["nextCursor"], created[1].as_str());

    let second = app
        .graphql(PAGE, json!({ "limit": 2, "cursor": first["nextCursor"] }), Auth::Bearer(&token))
        .await;
    let second = second.data("applicationsPage");
    assert_eq!(ids(&second["items"]), vec![created[0].as_str()]);
    assert_eq!(second["hasNextPage"], false);
    assert_eq!(second["nextCursor"], Value::Null);

    // A limit below one is raised to one rather than refused.
    let clamped = app.graphql(PAGE, json!({ "limit": 0 }), Auth::Bearer(&token)).await;
    assert_eq!(clamped.data("applicationsPage")["items"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn the_page_filters_by_search_star_and_status() {
    let (app, token) = app_with_owner().await;
    let globex = create(
        &app,
        &token,
        json!({ "company": "Globex", "role": "R", "starred": true, "status": "applied" }),
    )
    .await;
    create(&app, &token, json!({ "company": "Initech", "role": "R" })).await;
    let expected = vec![globex["id"].as_str().unwrap()];

    for variables in [
        json!({ "search": "  gLoBeX " }),
        json!({ "starred": true }),
        json!({ "status": "applied" }),
    ] {
        let page = app.graphql(PAGE, variables.clone(), Auth::Bearer(&token)).await;
        assert_eq!(ids(&page.data("applicationsPage")["items"]), expected, "{variables}");
    }

    let ghosted = app.graphql(PAGE, json!({ "likelyGhosted": true }), Auth::Bearer(&token)).await;
    assert_eq!(ghosted.data("applicationsPage")["items"], json!([]));
}

#[tokio::test]
async fn the_detail_query_counts_each_section_on_demand() {
    let (app, token) = app_with_owner().await;
    seed_application(&app.db, "app-1", "owner").await;
    let note = "mutation { createNote(applicationId: \"app-1\", content: \"hi\") { id } }";
    app.graphql(note, json!({}), Auth::Bearer(&token)).await.data("createNote");

    let response = app.graphql(DETAIL, json!({ "id": "app-1" }), Auth::Bearer(&token)).await;

    assert_eq!(
        response.data("application")["sectionCounts"],
        json!({
            "notes": 1, "interviews": 0, "contacts": 0,
            "documents": 0, "documentDrafts": 0, "offers": 0,
        })
    );
}

#[tokio::test]
async fn the_detail_query_refuses_missing_and_foreign_applications() {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    seed_application(&app.db, "theirs", "stranger").await;

    let missing = app.graphql(DETAIL, json!({ "id": "missing" }), Auth::Bearer(&token)).await;
    assert_eq!(missing.error_code(), "NOT_FOUND");
    assert_eq!(missing.error_message(), "Application not found");

    let foreign = app.graphql(DETAIL, json!({ "id": "theirs" }), Auth::Bearer(&token)).await;
    assert_eq!(foreign.error_code(), "FORBIDDEN");
    assert_eq!(foreign.body["errors"][0]["extensions"]["statusCode"], 403);
}

#[tokio::test]
async fn updates_fields_clears_nullable_ones_and_logs_what_changed() {
    let (app, token) = app_with_owner().await;
    let created = create(
        &app,
        &token,
        json!({ "company": "Acme", "role": "Engineer", "location": "Berlin", "source": "Referral" }),
    )
    .await;
    let id = created["id"].as_str().unwrap();

    let response = app
        .graphql(
            &update_mutation(),
            json!({ "id": id, "input": {
                "company": "Globex", "role": null, "location": null,
                "followUpAt": "2026-09-01", "tags": ["remote"],
            } }),
            Auth::Bearer(&token),
        )
        .await;
    let updated = response.data("updateApplication");

    assert_eq!(updated["company"], "Globex");
    assert_eq!(updated["role"], "Engineer", "a null role is no change");
    assert_eq!(updated["location"], Value::Null, "a null location clears it");
    assert_eq!(updated["source"], "Referral", "an omitted field is untouched");
    assert_eq!(updated["followUpAt"], "2026-09-01T00:00:00.000Z");
    assert_eq!(updated["tags"], json!(["remote"]));
    assert_eq!(
        activity(&app, id).await,
        vec![(
            "field_updated".to_string(),
            r#"{"fields":["company","location","followUpAt"]}"#.to_string()
        )]
    );

    // An empty string clears the date; resubmitting current values logs nothing.
    let response = app
        .graphql(
            &update_mutation(),
            json!({ "id": id, "input": { "followUpAt": "", "company": "Globex" } }),
            Auth::Bearer(&token),
        )
        .await;
    assert_eq!(response.data("updateApplication")["followUpAt"], Value::Null);
    let entries = activity(&app, id).await;
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[1].1, r#"{"fields":["followUpAt"]}"#);
}

#[tokio::test]
async fn a_status_change_stamps_applied_at_and_is_logged() {
    let (app, token) = app_with_owner().await;
    let created = create(&app, &token, json!({ "company": "Acme", "role": "Engineer" })).await;
    let id = created["id"].as_str().unwrap();
    sqlx::query(r#"UPDATE "JobApplication" SET "boardPosition" = 3 WHERE "id" = $1"#)
        .bind(id)
        .execute(app.db.pool())
        .await
        .unwrap();

    let response = app
        .graphql(
            &update_mutation(),
            json!({ "id": id, "input": { "status": "applied", "company": "Globex" } }),
            Auth::Bearer(&token),
        )
        .await;
    let updated = response.data("updateApplication");

    assert_eq!(updated["status"], "applied");
    assert_eq!(updated["boardPosition"], 0);
    assert!(updated["appliedAt"].is_string());
    assert_eq!(
        activity(&app, id).await,
        vec![("status_changed".to_string(), r#"{"from":"draft","to":"applied"}"#.to_string())]
    );
}

#[tokio::test]
async fn update_refuses_missing_foreign_and_trashed_applications() {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    seed_application(&app.db, "theirs", "stranger").await;
    seed_application(&app.db, "gone", "owner").await;
    sqlx::query(r#"UPDATE "JobApplication" SET "deletedAt" = now() WHERE "id" = 'gone'"#)
        .execute(app.db.pool())
        .await
        .unwrap();
    let update = |id: &'static str| {
        let query = update_mutation();
        let (app, token) = (&app, &token);
        async move {
            app.graphql(
                &query,
                json!({ "id": id, "input": { "company": "X" } }),
                Auth::Bearer(token),
            )
            .await
        }
    };

    assert_eq!(update("missing").await.error_code(), "NOT_FOUND");
    assert_eq!(update("gone").await.error_code(), "NOT_FOUND");
    let foreign = update("theirs").await;
    assert_eq!(foreign.error_code(), "FORBIDDEN");
    assert_eq!(foreign.body["data"]["updateApplication"], Value::Null);
}
