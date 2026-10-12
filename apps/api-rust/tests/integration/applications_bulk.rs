//! Trash, the bulk actions and the kanban board, through the real GraphQL
//! endpoint and a real database.

use serde_json::{json, Value};

use crate::applications::{activity, app_with_owner, create, ids};
use crate::common::{seed_application, seed_user, Auth, TestApp};

const DELETE: &str = "mutation($id: ID!) { deleteApplication(id: $id) }";
const RESTORE: &str = "mutation($id: ID!) { restoreApplication(id: $id) }";
const TRASH: &str = "query { trashedApplications { id deletedAt purgeAt } }";
const LIST: &str = "query { applications { id } }";
const DETAIL: &str = "query($id: ID!) {
    application(id: $id) { id deletedAt purgeAt sectionCounts { notes } }
}";
const BULK_DELETE: &str = "mutation($ids: [ID!]!) { bulkDeleteApplications(ids: $ids) }";
const BULK_RESTORE: &str =
    "mutation($ids: [ID!]!) { bulkRestoreApplications(ids: $ids) { restored } }";
const BULK_UPDATE: &str = "mutation($ids: [ID!]!, $status: ApplicationStatus, $starred: Boolean) {
    bulkUpdateApplications(ids: $ids, status: $status, starred: $starred) { id status starred }
}";
const BULK_TAG: &str = "mutation($ids: [ID!]!, $tag: String!) {
    bulkAddTagToApplications(ids: $ids, tag: $tag) { id tags }
}";
const MOVE: &str = "mutation($input: MoveApplicationOnBoardInput!) {
    moveApplicationOnBoard(input: $input) { id status boardPosition }
}";

/// An owner with live applications `a`, `b`, `c` (drafts) and a stranger
/// owning `theirs`.
async fn seeded() -> (TestApp, String) {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    for id in ["a", "b", "c"] {
        seed_application(&app.db, id, "owner").await;
    }
    seed_application(&app.db, "theirs", "stranger").await;
    (app, token)
}

async fn run(app: &TestApp, token: &str, query: &str, variables: Value) -> crate::common::Response {
    app.graphql(query, variables, Auth::Bearer(token)).await
}

async fn is_trashed(app: &TestApp, id: &str) -> bool {
    sqlx::query_scalar(r#"SELECT "deletedAt" IS NOT NULL FROM "JobApplication" WHERE "id" = $1"#)
        .bind(id)
        .fetch_one(app.db.pool())
        .await
        .unwrap()
}

fn too_many_ids() -> Vec<String> {
    (0..201).map(|n| format!("app-{n}")).collect()
}

#[tokio::test]
async fn delete_moves_an_application_to_trash_and_restore_brings_it_back() {
    let (app, token) = seeded().await;

    let deleted = run(&app, &token, DELETE, json!({ "id": "a" })).await;
    assert_eq!(deleted.data("deleteApplication"), &Value::Bool(true));

    let live = run(&app, &token, LIST, json!({})).await;
    assert!(!ids(live.data("applications")).contains(&"a"));

    let trash = run(&app, &token, TRASH, json!({})).await;
    let trash = trash.data("trashedApplications");
    assert_eq!(ids(trash), vec!["a"]);
    let deleted_at: chrono::DateTime<chrono::Utc> =
        trash[0]["deletedAt"].as_str().unwrap().parse().unwrap();
    let purge_at: chrono::DateTime<chrono::Utc> =
        trash[0]["purgeAt"].as_str().unwrap().parse().unwrap();
    assert_eq!(purge_at - deleted_at, chrono::TimeDelta::days(30));

    // The detail query still resolves it, so an old link can say "in Trash";
    // its section counts report it as missing instead.
    let detail = run(&app, &token, DETAIL, json!({ "id": "a" })).await;
    assert_eq!(detail.body["data"]["application"]["id"], "a");
    assert!(detail.body["data"]["application"]["deletedAt"].is_string());
    assert_eq!(detail.body["data"]["application"]["sectionCounts"], Value::Null);
    assert_eq!(detail.error_code(), "NOT_FOUND");

    let restored = run(&app, &token, RESTORE, json!({ "id": "a" })).await;
    assert_eq!(restored.data("restoreApplication"), &Value::Bool(true));
    assert!(!is_trashed(&app, "a").await);
    assert_eq!(run(&app, &token, TRASH, json!({})).await.data("trashedApplications"), &json!([]));
}

#[tokio::test]
async fn delete_and_restore_refuse_what_is_not_theirs_to_touch() {
    let (app, token) = seeded().await;
    let stranger = app.access_token("stranger");
    run(&app, &stranger, DELETE, json!({ "id": "theirs" })).await.data("deleteApplication");

    let missing = run(&app, &token, DELETE, json!({ "id": "missing" })).await;
    assert_eq!(missing.error_code(), "NOT_FOUND");
    assert_eq!(missing.error_message(), "Application not found");
    assert_eq!(run(&app, &token, DELETE, json!({ "id": "b" })).await.body.get("errors"), None);
    assert_eq!(run(&app, &token, DELETE, json!({ "id": "b" })).await.error_code(), "NOT_FOUND");

    let not_trashed = run(&app, &token, RESTORE, json!({ "id": "a" })).await;
    assert_eq!(not_trashed.error_code(), "NOT_FOUND");
    assert_eq!(not_trashed.error_message(), "Application not found in Trash not found");
    assert_eq!(
        run(&app, &token, RESTORE, json!({ "id": "theirs" })).await.error_code(),
        "FORBIDDEN"
    );
    assert!(is_trashed(&app, "theirs").await);

    for (query, field) in [(DELETE, "deleteApplication"), (RESTORE, "restoreApplication")] {
        let anonymous = app.graphql(query, json!({ "id": "a" }), Auth::None).await;
        assert_eq!(anonymous.error_code(), "UNAUTHORIZED", "{field}");
    }
    let anonymous = app.graphql(TRASH, json!({}), Auth::None).await;
    assert_eq!(anonymous.error_code(), "UNAUTHORIZED");
}

#[tokio::test]
async fn bulk_delete_skips_what_is_already_gone_but_not_what_is_someone_elses() {
    let (app, token) = seeded().await;

    let deleted = run(&app, &token, BULK_DELETE, json!({ "ids": ["a", "missing", "b"] })).await;
    assert_eq!(deleted.data("bulkDeleteApplications"), &Value::Bool(true));
    assert!(is_trashed(&app, "a").await && is_trashed(&app, "b").await);

    let refused = run(&app, &token, BULK_DELETE, json!({ "ids": ["theirs", "c"] })).await;
    assert_eq!(refused.error_code(), "FORBIDDEN");
    assert!(!is_trashed(&app, "theirs").await);
    assert!(is_trashed(&app, "c").await, "every id is attempted; the batch is not atomic");
}

#[tokio::test]
async fn bulk_restore_reports_how_many_actually_came_back() {
    let (app, token) = seeded().await;
    run(&app, &token, BULK_DELETE, json!({ "ids": ["a", "b"] })).await;

    let restored =
        run(&app, &token, BULK_RESTORE, json!({ "ids": ["a", "b", "c", "missing"] })).await;
    assert_eq!(restored.data("bulkRestoreApplications"), &json!({ "restored": 2 }));

    let stranger = app.access_token("stranger");
    run(&app, &stranger, DELETE, json!({ "id": "theirs" })).await;
    let refused = run(&app, &token, BULK_RESTORE, json!({ "ids": ["theirs"] })).await;
    assert_eq!(refused.error_code(), "FORBIDDEN");
}

#[tokio::test]
async fn bulk_update_changes_every_application_or_none() {
    let (app, token) = seeded().await;

    let updated = run(
        &app,
        &token,
        BULK_UPDATE,
        json!({ "ids": ["a", "b"], "status": "applied", "starred": true }),
    )
    .await;
    assert_eq!(
        updated.data("bulkUpdateApplications"),
        &json!([
            { "id": "a", "status": "applied", "starred": true },
            { "id": "b", "status": "applied", "starred": true },
        ])
    );
    assert_eq!(activity(&app, "a").await[0].1, r#"{"from":"draft","to":"applied"}"#);

    let refused =
        run(&app, &token, BULK_UPDATE, json!({ "ids": ["c", "theirs"], "status": "rejected" }))
            .await;
    assert_eq!(refused.error_code(), "FORBIDDEN");
    let status: String =
        sqlx::query_scalar(r#"SELECT "status" FROM "JobApplication" WHERE "id" = 'c'"#)
            .fetch_one(app.db.pool())
            .await
            .unwrap();
    assert_eq!(status, "draft", "the first update was rolled back with the batch");
    assert!(activity(&app, "c").await.is_empty());
}

#[tokio::test]
async fn bulk_add_tag_merges_without_duplicating() {
    let (app, token) = app_with_owner().await;
    let tagged =
        create(&app, &token, json!({ "company": "A", "role": "R", "tags": ["urgent", "remote"] }))
            .await;
    let plain = create(&app, &token, json!({ "company": "B", "role": "R" })).await;

    let response =
        run(&app, &token, BULK_TAG, json!({ "ids": [tagged["id"], plain["id"]], "tag": "urgent" }))
            .await;

    let updated = response.data("bulkAddTagToApplications");
    assert_eq!(updated[0]["tags"], json!(["urgent", "remote"]));
    assert_eq!(updated[1]["tags"], json!(["urgent"]));

    let missing = run(&app, &token, BULK_TAG, json!({ "ids": ["missing"], "tag": "x" })).await;
    assert_eq!(missing.error_code(), "NOT_FOUND");
}

#[tokio::test]
async fn every_bulk_action_validates_the_batch_size_and_needs_a_user() {
    let (app, token) = seeded().await;
    let actions = [
        (BULK_DELETE, "bulkDeleteApplications", json!({})),
        (BULK_RESTORE, "bulkRestoreApplications", json!({})),
        (BULK_UPDATE, "bulkUpdateApplications", json!({ "starred": true })),
        (BULK_TAG, "bulkAddTagToApplications", json!({ "tag": "x" })),
    ];

    for (query, field, extra) in actions {
        let with_ids = |ids: Value| {
            let mut variables = extra.clone();
            variables["ids"] = ids;
            variables
        };

        let empty = run(&app, &token, query, with_ids(json!([]))).await;
        assert_eq!(empty.error_code(), "VALIDATION", "{field}");
        assert_eq!(empty.error_message(), "At least one application id is required", "{field}");
        assert_eq!(empty.body["errors"][0]["extensions"]["statusCode"], 400, "{field}");

        let oversized = run(&app, &token, query, with_ids(json!(too_many_ids()))).await;
        assert_eq!(
            oversized.error_message(),
            "Cannot act on more than 200 applications at once",
            "{field}"
        );

        let anonymous = app.graphql(query, with_ids(json!(["a"])), Auth::None).await;
        assert_eq!(anonymous.error_code(), "UNAUTHORIZED", "{field}");
    }
}

#[tokio::test]
async fn a_move_within_a_column_renumbers_it_without_logging() {
    let (app, token) = seeded().await;

    let moved = run(
        &app,
        &token,
        MOVE,
        json!({ "input": { "applicationId": "c", "toStatus": "draft", "orderedIds": ["c", "a", "b"] } }),
    )
    .await;

    assert_eq!(
        moved.data("moveApplicationOnBoard"),
        &json!([
            { "id": "c", "status": "draft", "boardPosition": 0 },
            { "id": "a", "status": "draft", "boardPosition": 1 },
            { "id": "b", "status": "draft", "boardPosition": 2 },
        ])
    );
    assert!(activity(&app, "c").await.is_empty());
}

#[tokio::test]
async fn a_move_across_columns_changes_the_status_and_places_the_card() {
    let (app, token) = seeded().await;
    run(&app, &token, BULK_UPDATE, json!({ "ids": ["a", "b"], "status": "applied" })).await;

    let moved = run(
        &app,
        &token,
        MOVE,
        json!({ "input": { "applicationId": "c", "toStatus": "applied", "orderedIds": ["a", "c", "b"] } }),
    )
    .await;

    assert_eq!(
        moved.data("moveApplicationOnBoard"),
        &json!([
            { "id": "a", "status": "applied", "boardPosition": 0 },
            { "id": "c", "status": "applied", "boardPosition": 1 },
            { "id": "b", "status": "applied", "boardPosition": 2 },
        ])
    );
    assert_eq!(
        activity(&app, "c").await,
        vec![("status_changed".to_string(), r#"{"from":"draft","to":"applied"}"#.to_string())]
    );
}

#[tokio::test]
async fn a_move_is_validated_and_scoped_to_the_users_own_column() {
    let (app, token) = seeded().await;
    let attempt = |application_id: &'static str, ordered: Value| {
        let (app, token) = (&app, &token);
        async move {
            let input = json!({ "applicationId": application_id, "toStatus": "draft", "orderedIds": ordered });
            run(app, token, MOVE, json!({ "input": input })).await
        }
    };

    let cases = [
        (attempt("a", json!([])).await, "VALIDATION", "At least one application id is required"),
        (attempt("a", json!(["a", "b", "a"])).await, "VALIDATION", "Duplicate application ids"),
        (
            attempt("a", json!(["b", "c"])).await,
            "VALIDATION",
            "orderedIds must contain the moved application",
        ),
        (attempt("missing", json!(["missing"])).await, "NOT_FOUND", "Application not found"),
        (attempt("theirs", json!(["theirs"])).await, "FORBIDDEN", "Forbidden"),
        (attempt("a", json!(["a", "theirs"])).await, "FORBIDDEN", "Forbidden"),
        (attempt("a", json!(["a", "nope"])).await, "FORBIDDEN", "Forbidden"),
    ];
    for (response, code, message) in &cases {
        assert_eq!(response.error_code(), *code, "{message}");
        assert_eq!(response.error_message(), *message);
        assert_eq!(response.body["data"]["moveApplicationOnBoard"], Value::Null);
    }

    let too_many: Vec<String> = (0..501).map(|n| format!("app-{n}")).collect();
    let oversized = attempt("app-0", json!(too_many)).await;
    assert_eq!(oversized.error_message(), "Cannot reorder more than 500 applications at once");

    let input = json!({ "applicationId": "a", "toStatus": "draft", "orderedIds": ["a"] });
    let anonymous = app.graphql(MOVE, json!({ "input": input }), Auth::None).await;
    assert_eq!(anonymous.error_code(), "UNAUTHORIZED");
}
