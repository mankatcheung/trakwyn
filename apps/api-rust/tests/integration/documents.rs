//! Documents through the real GraphQL endpoint, a real database and the
//! local storage provider (files under `<cwd>/uploads`, removed per test).

use serde_json::{json, Value};
use tokio::net::TcpListener;

use trakwyn_api::config::Config;
use trakwyn_api::domain::interview_round::InterviewRoundType;
use trakwyn_api::use_cases::ports::CreateInterviewRoundData;

use crate::common::{seed_application, seed_user, test_config, Auth, TestApp};
use crate::uploads::{encode_key, get, put, Scratch};

const REQUEST_UPLOAD_URL: &str = "mutation($input: RequestUploadUrlInput!) {
    requestUploadUrl(input: $input) { uploadUrl storageKey }
}";
const CONFIRM: &str = "mutation($input: ConfirmDocumentInput!) {
    confirmDocument(input: $input) {
        id applicationId name mimeType sizeBytes url documentType version sourceDraftId createdAt
    }
}";
const LIST: &str = "query($applicationId: ID!) {
    documents(applicationId: $applicationId) { id name url documentType version }
}";
const DELETE: &str = "mutation($id: ID!) { deleteDocument(id: $id) }";
const EXTRACT: &str =
    "mutation($documentId: ID!) { extractDocumentText(documentId: $documentId) { text } }";
const OUTCOMES: &str = "{ documentVersionOutcomes {
    documentType version applicationCount interviewCount interviewRate
} }";

/// An app whose owner and application carry the scratch ids, so the files a
/// test stores are its own.
pub struct Owned {
    pub app: TestApp,
    pub scratch: Scratch,
    pub token: String,
}

impl Owned {
    pub async fn start() -> Self {
        Self::start_with(test_config()).await
    }

    pub async fn start_with(config: Config) -> Self {
        let app = TestApp::start_with(config).await;
        let scratch = Scratch::new();
        seed_user(&app.db, &scratch.user_id).await;
        seed_application(&app.db, &scratch.application_id, &scratch.user_id).await;
        let token = app.access_token(&scratch.user_id);
        Self { app, scratch, token }
    }

    pub async fn graphql(&self, query: &str, variables: Value) -> crate::common::Response {
        self.app.graphql(query, variables, Auth::Bearer(&self.token)).await
    }

    /// A second user with no claim on the owner's application.
    pub async fn stranger(&self) -> String {
        let id = format!("{}-stranger", self.scratch.user_id);
        seed_user(&self.app.db, &id).await;
        self.app.access_token(&id)
    }

    fn confirm_variables(&self, storage_key: &str) -> Value {
        json!({ "input": {
            "applicationId": self.scratch.application_id,
            "storageKey": storage_key,
            "name": "resume.pdf",
            "mimeType": "application/pdf",
            "sizeBytes": 2048,
        } })
    }

    /// Records a document at a key of the owner's, without uploading a file.
    pub async fn confirm(&self, file_name: &str) -> Value {
        let key = self.scratch.upload_key(file_name);
        self.graphql(CONFIRM, self.confirm_variables(&key)).await.data("confirmDocument").clone()
    }
}

fn is_iso_timestamp(value: &Value) -> bool {
    value.as_str().is_some_and(|text| text.len() == 24 && text.ends_with('Z'))
}

#[tokio::test]
async fn an_upload_is_requested_put_confirmed_listed_and_served() {
    let owned = Owned::start().await;
    let Scratch { user_id, application_id } = &owned.scratch;

    let requested = owned
        .graphql(
            REQUEST_UPLOAD_URL,
            json!({ "input": {
                "applicationId": application_id,
                "filename": "My Resume (final).pdf",
                "mimeType": "application/pdf",
            } }),
        )
        .await;
    let payload = requested.data("requestUploadUrl");
    let storage_key = payload["storageKey"].as_str().unwrap();
    let prefix = format!("users/{user_id}/applications/{application_id}/");
    let minted = storage_key.strip_prefix(&prefix).unwrap();
    // A 21-character id, a dash, the sanitized name.
    assert_eq!(&minted[21..], "-My-Resume-final.pdf", "{storage_key}");
    // The test config's port is 0.
    let upload_path = format!("/uploads/_upload/{}", encode_key(storage_key));
    assert_eq!(payload["uploadUrl"], format!("http://localhost:0{upload_path}"));

    let uploaded = put(&owned.app, &upload_path, Some("application/pdf"), b"%PDF-1.4 body").await;
    assert_eq!(uploaded.status, 204);

    let mut variables = owned.confirm_variables(storage_key);
    variables["input"]["documentType"] = json!("resume");
    variables["input"]["version"] = json!("v3");
    let confirmed = owned.graphql(CONFIRM, variables).await;
    let document = confirmed.data("confirmDocument");
    assert_eq!(document["id"].as_str().unwrap().len(), 21);
    assert_eq!(document["applicationId"], *application_id);
    assert_eq!(document["name"], "resume.pdf");
    assert_eq!(document["mimeType"], "application/pdf");
    assert_eq!(document["sizeBytes"], 2048);
    assert_eq!(document["documentType"], "resume");
    assert_eq!(document["version"], "v3");
    assert_eq!(document["sourceDraftId"], Value::Null);
    assert!(is_iso_timestamp(&document["createdAt"]), "{}", document["createdAt"]);
    assert_eq!(document["url"], format!("http://localhost:0/uploads/{storage_key}"));

    let listed = owned.graphql(LIST, json!({ "applicationId": application_id })).await;
    assert_eq!(
        listed.data("documents"),
        &json!([{
            "id": document["id"],
            "name": "resume.pdf",
            "url": document["url"],
            "documentType": "resume",
            "version": "v3",
        }])
    );

    let served = get(&owned.app, &format!("/uploads/{storage_key}")).await;
    assert_eq!(served.status, 200);
    assert_eq!(served.body, b"%PDF-1.4 body");

    let (event_type, payload): (String, String) = sqlx::query_as(
        r#"SELECT "eventType", "payload" FROM "ActivityLog" WHERE "applicationId" = $1"#,
    )
    .bind(application_id)
    .fetch_one(owned.app.db.pool())
    .await
    .unwrap();
    assert_eq!(event_type, "document_uploaded");
    assert_eq!(payload, json!({ "documentId": document["id"], "name": "resume.pdf" }).to_string());
}

#[tokio::test]
async fn a_document_confirmed_without_a_type_is_stored_as_other() {
    let owned = Owned::start().await;

    let document = owned.confirm("a.pdf").await;

    assert_eq!(document["documentType"], "other");
    assert_eq!(document["version"], Value::Null);
}

#[tokio::test]
async fn lists_documents_newest_first() {
    let owned = Owned::start().await;
    let first = owned.confirm("first.pdf").await;
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    let second = owned.confirm("second.pdf").await;

    let listed =
        owned.graphql(LIST, json!({ "applicationId": owned.scratch.application_id })).await;

    let ids: Vec<&Value> = listed
        .data("documents")
        .as_array()
        .unwrap()
        .iter()
        .map(|document| &document["id"])
        .collect();
    assert_eq!(ids, vec![&second["id"], &first["id"]]);
}

#[tokio::test]
async fn requesting_an_upload_url_validates_the_type_the_owner_and_the_quota() {
    let owned = Owned::start().await;
    let application_id = &owned.scratch.application_id;
    let input = |mime_type: &str| {
        json!({ "input": {
            "applicationId": application_id, "filename": "a.pdf", "mimeType": mime_type,
        } })
    };

    let unsupported = owned.graphql(REQUEST_UPLOAD_URL, input("application/zip")).await;
    assert_eq!(unsupported.error_code(), "VALIDATION");
    assert_eq!(unsupported.error_message(), "Unsupported file type: application/zip");
    assert_eq!(unsupported.body["errors"][0]["extensions"]["statusCode"], 400);

    let stranger = owned.stranger().await;
    let forbidden = owned
        .app
        .graphql(REQUEST_UPLOAD_URL, input("application/pdf"), Auth::Bearer(&stranger))
        .await;
    assert_eq!(forbidden.error_code(), "FORBIDDEN");
    assert_eq!(forbidden.error_message(), "Forbidden");

    let missing = owned
        .graphql(
            REQUEST_UPLOAD_URL,
            json!({ "input": {
                "applicationId": "missing", "filename": "a.pdf", "mimeType": "application/pdf",
            } }),
        )
        .await;
    assert_eq!(missing.error_code(), "NOT_FOUND");
    assert_eq!(missing.error_message(), "Application not found");

    for index in 0..10 {
        owned.confirm(&format!("doc-{index}.pdf")).await;
    }
    let full = owned.graphql(REQUEST_UPLOAD_URL, input("application/pdf")).await;
    assert_eq!(full.error_code(), "QUOTA_EXCEEDED");
    assert_eq!(full.error_message(), "This application already has the maximum of 10 documents");
    assert_eq!(full.body["errors"][0]["extensions"]["statusCode"], 409);
}

#[tokio::test]
async fn confirming_validates_the_type_and_the_size() {
    let owned = Owned::start().await;
    let key = owned.scratch.upload_key("a.pdf");

    for (field, value, message) in [
        ("mimeType", json!("application/zip"), "Unsupported file type: application/zip"),
        ("sizeBytes", json!(0), "File size must be greater than 0 bytes"),
        ("sizeBytes", json!(-1), "File size must be greater than 0 bytes"),
        (
            "sizeBytes",
            json!(10 * 1024 * 1024 + 1),
            "File exceeds the maximum allowed size of 10485760 bytes",
        ),
    ] {
        let mut variables = owned.confirm_variables(&key);
        variables["input"][field] = value;

        let response = owned.graphql(CONFIRM, variables).await;

        assert_eq!(response.error_code(), "VALIDATION", "{message}");
        assert_eq!(response.error_message(), message);
        assert_eq!(response.body["data"]["confirmDocument"], Value::Null);
    }
}

#[tokio::test]
async fn the_eleventh_document_is_refused_and_its_upload_removed() {
    let owned = Owned::start().await;
    for index in 0..10 {
        owned.confirm(&format!("doc-{index}.pdf")).await;
    }
    let key = owned.scratch.upload_key("one-too-many.pdf");
    owned.scratch.write(&key, b"%PDF");

    let response = owned.graphql(CONFIRM, owned.confirm_variables(&key)).await;

    assert_eq!(response.error_code(), "QUOTA_EXCEEDED");
    assert_eq!(
        response.error_message(),
        "This application already has the maximum of 10 documents"
    );
    assert!(!owned.scratch.holds(&key));
}

#[tokio::test]
async fn a_stranger_cannot_confirm_onto_the_application_and_the_owners_upload_stays() {
    let owned = Owned::start().await;
    let key = owned.scratch.upload_key("resume.pdf");
    owned.scratch.write(&key, b"%PDF");
    let stranger = owned.stranger().await;

    let response =
        owned.app.graphql(CONFIRM, owned.confirm_variables(&key), Auth::Bearer(&stranger)).await;

    assert_eq!(response.error_code(), "FORBIDDEN");
    assert_eq!(response.error_message(), "Forbidden");
    assert!(owned.scratch.holds(&key));
}

#[tokio::test]
async fn deleting_removes_the_file_and_the_record_and_logs_it() {
    let owned = Owned::start().await;
    let key = owned.scratch.upload_key("resume.pdf");
    owned.scratch.write(&key, b"%PDF");
    let document = owned.confirm("resume.pdf").await;

    let deleted = owned.graphql(DELETE, json!({ "id": document["id"] })).await;

    assert_eq!(deleted.data("deleteDocument"), &Value::Bool(true));
    assert!(!owned.scratch.holds(&key));
    let listed =
        owned.graphql(LIST, json!({ "applicationId": owned.scratch.application_id })).await;
    assert_eq!(listed.data("documents"), &json!([]));

    let payload: String = sqlx::query_scalar(
        r#"SELECT "payload" FROM "ActivityLog"
           WHERE "applicationId" = $1 AND "eventType" = 'document_deleted'"#,
    )
    .bind(&owned.scratch.application_id)
    .fetch_one(owned.app.db.pool())
    .await
    .unwrap();
    assert_eq!(payload, json!({ "documentId": document["id"], "name": "resume.pdf" }).to_string());
}

#[tokio::test]
async fn deleting_frees_a_slot_in_the_quota() {
    let owned = Owned::start().await;
    let mut last = Value::Null;
    for index in 0..10 {
        last = owned.confirm(&format!("doc-{index}.pdf")).await;
    }

    owned.graphql(DELETE, json!({ "id": last["id"] })).await.data("deleteDocument");

    assert_eq!(owned.confirm("fits-again.pdf").await["name"], "resume.pdf");
}

#[tokio::test]
async fn a_stranger_cannot_delete_or_list_and_a_missing_document_is_not_found() {
    let owned = Owned::start().await;
    let key = owned.scratch.upload_key("resume.pdf");
    owned.scratch.write(&key, b"%PDF");
    let document = owned.confirm("resume.pdf").await;
    let stranger = owned.stranger().await;

    let forbidden =
        owned.app.graphql(DELETE, json!({ "id": document["id"] }), Auth::Bearer(&stranger)).await;
    assert_eq!(forbidden.error_code(), "FORBIDDEN");
    assert!(owned.scratch.holds(&key));

    let listing = owned
        .app
        .graphql(
            LIST,
            json!({ "applicationId": owned.scratch.application_id }),
            Auth::Bearer(&stranger),
        )
        .await;
    assert_eq!(listing.error_code(), "FORBIDDEN");

    let missing = owned.graphql(DELETE, json!({ "id": "missing" })).await;
    assert_eq!(missing.error_code(), "NOT_FOUND");
    assert_eq!(missing.error_message(), "Document not found");
}

#[tokio::test]
async fn every_document_operation_needs_a_signed_in_user() {
    let owned = Owned::start().await;
    let application_id = &owned.scratch.application_id;

    for (query, variables) in [
        (LIST, json!({ "applicationId": application_id })),
        (OUTCOMES, json!({})),
        (DELETE, json!({ "id": "doc" })),
        (EXTRACT, json!({ "documentId": "doc" })),
        (CONFIRM, owned.confirm_variables("key")),
        (
            REQUEST_UPLOAD_URL,
            json!({ "input": {
                "applicationId": application_id, "filename": "a.pdf", "mimeType": "application/pdf",
            } }),
        ),
    ] {
        let response = owned.app.graphql(query, variables, Auth::None).await;

        assert_eq!(response.error_code(), "UNAUTHORIZED", "{query}");
        assert_eq!(response.error_message(), "Unauthorized");
    }
}

/// `extractDocumentText` reads the file back over HTTP from the URL the
/// storage provider hands out, so the app has to be listening on the port
/// that URL names.
#[tokio::test]
async fn extracts_the_text_of_an_uploaded_document() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let owned = Owned::start_with(Config { port, ..test_config() }).await;
    let router = owned.app.router.clone();
    let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });

    let key = owned.scratch.upload_key("notes.txt");
    owned.scratch.write(&key, "Ten years of Rust.".as_bytes());
    let mut variables = owned.confirm_variables(&key);
    variables["input"]["mimeType"] = json!("text/plain");
    let confirmed = owned.graphql(CONFIRM, variables).await;
    let document = confirmed.data("confirmDocument");
    assert_eq!(document["url"], format!("http://localhost:{port}/uploads/{key}"));

    let extracted = owned.graphql(EXTRACT, json!({ "documentId": document["id"] })).await;
    assert_eq!(extracted.data("extractDocumentText"), &json!({ "text": "Ten years of Rust." }));

    // The record outlives its file: the read fails, which is the server's fault.
    std::fs::remove_file(
        trakwyn_api::infrastructure::storage::LocalStorageProvider::default_upload_dir()
            .unwrap()
            .join(&key),
    )
    .unwrap();
    let unreadable = owned.graphql(EXTRACT, json!({ "documentId": document["id"] })).await;
    assert_eq!(unreadable.error_code(), "INTERNAL_ERROR");
    assert_eq!(unreadable.error_message(), "Internal server error");

    let stranger = owned.stranger().await;
    let forbidden = owned
        .app
        .graphql(EXTRACT, json!({ "documentId": document["id"] }), Auth::Bearer(&stranger))
        .await;
    assert_eq!(forbidden.error_code(), "FORBIDDEN");
    assert_eq!(forbidden.error_message(), "Not authorized");

    let missing = owned.graphql(EXTRACT, json!({ "documentId": "missing" })).await;
    assert_eq!(missing.error_code(), "NOT_FOUND");
    assert_eq!(missing.error_message(), "Document not found");

    server.abort();
}

#[tokio::test]
async fn version_outcomes_count_applications_and_interviews_per_version() {
    let owned = Owned::start().await;
    let user_id = &owned.scratch.user_id;
    let first = &owned.scratch.application_id;
    let second = format!("{first}-2");
    seed_application(&owned.app.db, &second, user_id).await;

    for (application_id, file_name, document_type, version) in [
        (first.as_str(), "a.pdf", "resume", Some("v3")),
        (second.as_str(), "b.pdf", "resume", Some("v3")),
        (first.as_str(), "c.pdf", "cover_letter", None),
        (first.as_str(), "d.pdf", "portfolio", Some("v3")),
    ] {
        let mut variables = owned.confirm_variables(&owned.scratch.upload_key(file_name));
        variables["input"]["applicationId"] = json!(application_id);
        variables["input"]["documentType"] = json!(document_type);
        variables["input"]["version"] = json!(version);
        owned.graphql(CONFIRM, variables).await.data("confirmDocument");
    }
    owned
        .app
        .container
        .interview_round_repository
        .create(CreateInterviewRoundData {
            id: "round-1".to_string(),
            application_id: second.clone(),
            r#type: InterviewRoundType::Phone,
            scheduled_at: None,
            completed_at: None,
            interviewer_name: None,
            notes: None,
            outcome: None,
        })
        .await
        .unwrap();

    let outcomes = owned.graphql(OUTCOMES, json!({})).await;

    assert_eq!(
        outcomes.data("documentVersionOutcomes"),
        &json!([
            {
                "documentType": "resume", "version": "v3",
                "applicationCount": 2, "interviewCount": 1, "interviewRate": 50,
            },
            {
                "documentType": "cover_letter", "version": null,
                "applicationCount": 1, "interviewCount": 0, "interviewRate": 0,
            },
        ])
    );

    let stranger = owned.stranger().await;
    let theirs = owned.app.graphql(OUTCOMES, json!({}), Auth::Bearer(&stranger)).await;
    assert_eq!(theirs.data("documentVersionOutcomes"), &json!([]));
}
