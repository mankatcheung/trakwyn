//! Document drafts through the real GraphQL endpoint and a real database,
//! including the export to a PDF in local storage.

use serde_json::{json, Value};

use crate::common::Auth;
use crate::documents::Owned;
use crate::uploads::get;

const FIELDS: &str =
    "id applicationId type title contentJson plainText sourceDocumentId createdAt updatedAt";
const LIST: &str =
    "query($applicationId: ID!) { documentDrafts(applicationId: $applicationId) { id title } }";
const DELETE: &str = "mutation($id: ID!) { deleteDocumentDraft(id: $id) }";
const EXPORT: &str = "mutation($draftId: ID!) {
    exportDocumentDraftToPdf(draftId: $draftId) {
        id applicationId name mimeType sizeBytes url documentType version sourceDraftId createdAt
    }
}";

fn create_query() -> String {
    format!(
        "mutation($input: CreateDocumentDraftInput!) {{ createDocumentDraft(input: $input) {{ {FIELDS} }} }}"
    )
}

fn get_query() -> String {
    format!("query($id: ID!) {{ documentDraft(id: $id) {{ {FIELDS} }} }}")
}

fn update_query() -> String {
    format!(
        "mutation($input: UpdateDocumentDraftContentInput!) {{
            updateDocumentDraftContent(input: $input) {{ {FIELDS} }}
        }}"
    )
}

fn rename_query() -> String {
    format!(
        "mutation($draftId: ID!, $title: String!) {{
            renameDocumentDraft(draftId: $draftId, title: $title) {{ {FIELDS} }}
        }}"
    )
}

const CONTENT: &str = r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Dear Acme"}]}]}"#;

async fn create(owned: &Owned, title: &str) -> Value {
    let variables = json!({ "input": {
        "applicationId": owned.scratch.application_id,
        "type": "cover_letter",
        "title": title,
        "contentJson": CONTENT,
        "plainText": "Dear Acme",
    } });
    owned.graphql(&create_query(), variables).await.data("createDocumentDraft").clone()
}

#[tokio::test]
async fn creates_a_draft_and_reads_it_back() {
    let owned = Owned::start().await;

    let draft = create(&owned, "Cover Letter - Acme").await;

    assert_eq!(draft["id"].as_str().unwrap().len(), 21);
    assert_eq!(draft["applicationId"], owned.scratch.application_id);
    assert_eq!(draft["type"], "cover_letter");
    assert_eq!(draft["title"], "Cover Letter - Acme");
    assert_eq!(draft["contentJson"], CONTENT);
    assert_eq!(draft["plainText"], "Dear Acme");
    assert_eq!(draft["sourceDocumentId"], Value::Null);
    assert_eq!(draft["createdAt"].as_str().unwrap().len(), 24);
    assert_eq!(draft["createdAt"], draft["updatedAt"]);

    let fetched = owned.graphql(&get_query(), json!({ "id": draft["id"] })).await;
    assert_eq!(fetched.data("documentDraft"), &draft);
}

#[tokio::test]
async fn a_draft_created_without_content_gets_the_defaults_and_keeps_its_source() {
    let owned = Owned::start().await;
    let source = owned.confirm("resume.pdf").await;

    let response = owned
        .graphql(
            &create_query(),
            json!({ "input": {
                "applicationId": owned.scratch.application_id,
                "type": "resume",
                "title": "Resume",
                "sourceDocumentId": source["id"],
            } }),
        )
        .await;

    let draft = response.data("createDocumentDraft");
    assert_eq!(draft["type"], "resume");
    assert_eq!(draft["contentJson"], "{}");
    assert_eq!(draft["plainText"], "");
    assert_eq!(draft["sourceDocumentId"], source["id"]);
}

#[tokio::test]
async fn a_draft_type_outside_the_two_is_refused() {
    let owned = Owned::start().await;

    let response = owned
        .graphql(
            &create_query(),
            json!({ "input": {
                "applicationId": owned.scratch.application_id, "type": "portfolio", "title": "x",
            } }),
        )
        .await;

    assert_eq!(response.error_code(), "VALIDATION");
    assert_eq!(response.error_message(), "Invalid document draft type");
}

#[tokio::test]
async fn lists_drafts_most_recently_updated_first() {
    let owned = Owned::start().await;
    let first = create(&owned, "first").await;
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    create(&owned, "second").await;
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    // An edit moves the older draft back to the top.
    owned
        .graphql(
            &update_query(),
            json!({ "input": { "draftId": first["id"], "contentJson": "{}", "plainText": "" } }),
        )
        .await
        .data("updateDocumentDraftContent");

    let listed =
        owned.graphql(LIST, json!({ "applicationId": owned.scratch.application_id })).await;

    let titles: Vec<&str> = listed
        .data("documentDrafts")
        .as_array()
        .unwrap()
        .iter()
        .map(|draft| draft["title"].as_str().unwrap())
        .collect();
    assert_eq!(titles, vec!["first", "second"]);
}

#[tokio::test]
async fn updates_the_content_without_touching_the_title() {
    let owned = Owned::start().await;
    let draft = create(&owned, "Cover Letter - Acme").await;
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;

    let response = owned
        .graphql(
            &update_query(),
            json!({ "input": {
                "draftId": draft["id"],
                "contentJson": r#"{"type":"doc"}"#,
                "plainText": "Rewritten",
            } }),
        )
        .await;

    let updated = response.data("updateDocumentDraftContent");
    assert_eq!(updated["contentJson"], r#"{"type":"doc"}"#);
    assert_eq!(updated["plainText"], "Rewritten");
    assert_eq!(updated["title"], "Cover Letter - Acme");
    assert_eq!(updated["createdAt"], draft["createdAt"]);
    assert_ne!(updated["updatedAt"], draft["updatedAt"]);
}

#[tokio::test]
async fn renames_a_draft_trimming_the_title_and_refusing_a_blank_one() {
    let owned = Owned::start().await;
    let draft = create(&owned, "Cover Letter - Acme").await;

    let renamed = owned
        .graphql(&rename_query(), json!({ "draftId": draft["id"], "title": "  Final letter \n" }))
        .await;
    let renamed = renamed.data("renameDocumentDraft");
    assert_eq!(renamed["title"], "Final letter");
    assert_eq!(renamed["contentJson"], CONTENT);

    let blank =
        owned.graphql(&rename_query(), json!({ "draftId": draft["id"], "title": "   " })).await;
    assert_eq!(blank.error_code(), "VALIDATION");
    assert_eq!(blank.error_message(), "Title is required");
    assert_eq!(blank.body["errors"][0]["extensions"]["statusCode"], 400);
}

#[tokio::test]
async fn deletes_a_draft() {
    let owned = Owned::start().await;
    let draft = create(&owned, "Cover Letter - Acme").await;

    let deleted = owned.graphql(DELETE, json!({ "id": draft["id"] })).await;
    assert_eq!(deleted.data("deleteDocumentDraft"), &Value::Bool(true));

    let fetched = owned.graphql(&get_query(), json!({ "id": draft["id"] })).await;
    assert_eq!(fetched.error_code(), "NOT_FOUND");
    assert_eq!(fetched.error_message(), "Document draft not found");
}

#[tokio::test]
async fn a_missing_draft_is_not_found_by_every_operation() {
    let owned = Owned::start().await;

    for (query, variables) in [
        (get_query(), json!({ "id": "missing" })),
        (
            update_query(),
            json!({ "input": { "draftId": "missing", "contentJson": "{}", "plainText": "" } }),
        ),
        (rename_query(), json!({ "draftId": "missing", "title": "Title" })),
        (DELETE.to_string(), json!({ "id": "missing" })),
        (EXPORT.to_string(), json!({ "draftId": "missing" })),
    ] {
        let response = owned.graphql(&query, variables).await;

        assert_eq!(response.error_code(), "NOT_FOUND", "{query}");
        assert_eq!(response.error_message(), "Document draft not found");
    }
}

#[tokio::test]
async fn a_stranger_is_refused_by_every_operation() {
    let owned = Owned::start().await;
    let draft = create(&owned, "Cover Letter - Acme").await;
    let stranger = owned.stranger().await;
    let application_id = &owned.scratch.application_id;

    // A single draft is forbidden; the application-level ones hide that the
    // application exists at all.
    for (query, variables, code, message) in [
        (get_query(), json!({ "id": draft["id"] }), "FORBIDDEN", "Not authorized"),
        (
            update_query(),
            json!({ "input": { "draftId": draft["id"], "contentJson": "{}", "plainText": "" } }),
            "FORBIDDEN",
            "Not authorized",
        ),
        (
            rename_query(),
            json!({ "draftId": draft["id"], "title": "Mine" }),
            "FORBIDDEN",
            "Not authorized",
        ),
        (DELETE.to_string(), json!({ "id": draft["id"] }), "FORBIDDEN", "Not authorized"),
        (EXPORT.to_string(), json!({ "draftId": draft["id"] }), "FORBIDDEN", "Not authorized"),
        (
            LIST.to_string(),
            json!({ "applicationId": application_id }),
            "NOT_FOUND",
            "Application not found",
        ),
        (
            create_query(),
            json!({ "input": { "applicationId": application_id, "type": "resume", "title": "x" } }),
            "NOT_FOUND",
            "Application not found",
        ),
    ] {
        let response = owned.app.graphql(&query, variables, Auth::Bearer(&stranger)).await;

        assert_eq!(response.error_code(), code, "{query}");
        assert_eq!(response.error_message(), message, "{query}");
    }

    let untouched = owned.graphql(&get_query(), json!({ "id": draft["id"] })).await;
    assert_eq!(untouched.data("documentDraft"), &draft);
}

#[tokio::test]
async fn every_draft_operation_needs_a_signed_in_user() {
    let owned = Owned::start().await;

    for (query, variables) in [
        (get_query(), json!({ "id": "d" })),
        (LIST.to_string(), json!({ "applicationId": "a" })),
        (
            create_query(),
            json!({ "input": { "applicationId": "a", "type": "nope", "title": "x" } }),
        ),
        (
            update_query(),
            json!({ "input": { "draftId": "d", "contentJson": "{}", "plainText": "" } }),
        ),
        (rename_query(), json!({ "draftId": "d", "title": "" })),
        (DELETE.to_string(), json!({ "id": "d" })),
        (EXPORT.to_string(), json!({ "draftId": "d" })),
    ] {
        let response = owned.app.graphql(&query, variables, Auth::None).await;

        assert_eq!(response.error_code(), "UNAUTHORIZED", "{query}");
    }
}

#[tokio::test]
async fn exports_a_draft_to_a_pdf_document_linked_to_it() {
    let owned = Owned::start().await;
    let application_id = &owned.scratch.application_id;
    let draft = create(&owned, "Cover Letter - Acme").await;

    let exported = owned.graphql(EXPORT, json!({ "draftId": draft["id"] })).await;

    let document = exported.data("exportDocumentDraftToPdf");
    let id = document["id"].as_str().unwrap();
    assert_eq!(id.len(), 21);
    assert_eq!(document["applicationId"], *application_id);
    assert_eq!(document["name"], "Cover_Letter___Acme.pdf");
    assert_eq!(document["mimeType"], "application/pdf");
    assert_eq!(document["documentType"], "cover_letter");
    assert_eq!(document["version"], Value::Null);
    assert_eq!(document["sourceDraftId"], draft["id"]);
    let key = format!("documents/{application_id}/{id}.pdf");
    assert_eq!(document["url"], format!("http://localhost:0/uploads/{key}"));

    let stored = owned.scratch.read(&key);
    assert!(stored.starts_with(b"%PDF-"), "not a PDF");
    assert_eq!(document["sizeBytes"], stored.len());
    let served = get(&owned.app, &format!("/uploads/{key}")).await;
    assert_eq!(served.status, 200);
    assert_eq!(served.headers["content-type"], "application/pdf");
    assert_eq!(served.body, stored);

    let storage_key: String =
        sqlx::query_scalar(r#"SELECT "storageKey" FROM "Document" WHERE "id" = $1"#)
            .bind(id)
            .fetch_one(owned.app.db.pool())
            .await
            .unwrap();
    assert_eq!(storage_key, key);
    // The draft is still there to keep editing.
    owned.graphql(&get_query(), json!({ "id": draft["id"] })).await.data("documentDraft");
}

#[tokio::test]
async fn an_export_over_the_document_quota_is_refused_and_leaves_no_file() {
    let owned = Owned::start().await;
    let draft = create(&owned, "Cover Letter - Acme").await;
    for index in 0..10 {
        owned.confirm(&format!("doc-{index}.pdf")).await;
    }

    let response = owned.graphql(EXPORT, json!({ "draftId": draft["id"] })).await;

    assert_eq!(response.error_code(), "QUOTA_EXCEEDED");
    assert_eq!(
        response.error_message(),
        "This application already has the maximum of 10 documents"
    );
    let exports = trakwyn_api::infrastructure::storage::LocalStorageProvider::default_upload_dir()
        .unwrap()
        .join("documents")
        .join(&owned.scratch.application_id);
    let left_behind = std::fs::read_dir(&exports).map(|entries| entries.count()).unwrap_or(0);
    assert_eq!(left_behind, 0);
}

#[tokio::test]
async fn deleting_a_draft_keeps_its_exported_document_and_clears_the_link() {
    let owned = Owned::start().await;
    let draft = create(&owned, "Cover Letter - Acme").await;
    let exported = owned.graphql(EXPORT, json!({ "draftId": draft["id"] })).await;
    let document_id = exported.data("exportDocumentDraftToPdf")["id"].clone();

    owned.graphql(DELETE, json!({ "id": draft["id"] })).await.data("deleteDocumentDraft");

    let source_draft_id: Option<String> =
        sqlx::query_scalar(r#"SELECT "sourceDraftId" FROM "Document" WHERE "id" = $1"#)
            .bind(document_id.as_str().unwrap())
            .fetch_one(owned.app.db.pool())
            .await
            .unwrap();
    assert_eq!(source_draft_id, None);
}
