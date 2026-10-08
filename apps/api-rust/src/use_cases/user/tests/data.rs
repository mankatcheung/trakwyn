use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde_json::json;

use super::support::*;
use crate::domain::application::{Application, ApplicationStatus};
use crate::domain::document::Document;
use crate::domain::note::Note;
use crate::use_cases::clock::now;
use crate::use_cases::constants::content_limits::APPLICATIONS_PER_USER;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{
    application_owned_by, sequential_ids, FakeApplicationRepository, FakeDocumentRepository,
    FakeNoteRepository,
};
use crate::use_cases::user::*;

fn at(seconds: i64) -> DateTime<Utc> {
    DateTime::<Utc>::from_timestamp(seconds, 0).unwrap()
}

mod export {
    use super::*;

    fn use_case(
        users: Vec<crate::domain::user::User>,
        applications: Vec<Application>,
        notes: Vec<Note>,
        documents: Vec<Document>,
    ) -> ExportUserDataUseCase {
        ExportUserDataUseCase {
            user_repository: super::users(users),
            application_repository: Arc::new(FakeApplicationRepository::with(applications)),
            note_repository: Arc::new(FakeNoteRepository::with(notes)),
            document_repository: Arc::new(FakeDocumentRepository::with(documents)),
        }
    }

    fn note(id: &str, application_id: &str, seconds: i64) -> Note {
        Note {
            id: id.to_string(),
            application_id: application_id.to_string(),
            content: format!("content of {id}"),
            created_at: at(seconds),
            updated_at: at(seconds),
        }
    }

    fn document(id: &str, application_id: &str, seconds: i64) -> Document {
        Document {
            id: id.to_string(),
            application_id: application_id.to_string(),
            name: format!("{id}.pdf"),
            mime_type: "application/pdf".to_string(),
            size_bytes: 2048,
            storage_key: format!("users/user-1/{id}.pdf"),
            document_type: "resume".to_string(),
            version: None,
            source_draft_id: None,
            created_at: at(seconds),
        }
    }

    #[tokio::test]
    async fn fails_when_the_user_does_not_exist() {
        let err = use_case(vec![], vec![], vec![], vec![]).execute(USER).await.unwrap_err();
        assert_error(&err, ErrorCode::NotFound, "User not found");
    }

    #[tokio::test]
    async fn exports_the_account_with_no_applications() {
        let before = now();

        let output = use_case(vec![user()], vec![], vec![], vec![]).execute(USER).await.unwrap();

        assert_eq!(
            output.user,
            ExportedUser { email: EMAIL.to_string(), created_at: DateTime::<Utc>::UNIX_EPOCH }
        );
        assert!(output.applications.is_empty());
        assert!(output.exported_at >= before && output.exported_at <= now());
    }

    #[tokio::test]
    async fn exports_each_application_with_its_notes_and_document_metadata() {
        let application = Application {
            company: "Acme".to_string(),
            role: "Engineer".to_string(),
            status: ApplicationStatus::Interviewing,
            job_url: Some("https://acme.example/jobs/1".to_string()),
            location: Some("Remote".to_string()),
            salary_range: Some("100-120k".to_string()),
            description: Some("Build things".to_string()),
            applied_at: Some(at(1_700_000_000)),
            created_at: at(1_690_000_000),
            ..application_owned_by("app-1", USER)
        };

        let output = use_case(
            vec![user()],
            vec![application],
            vec![note("n1", "app-1", 10), note("n2", "app-1", 20), note("n3", "app-other", 30)],
            vec![document("d1", "app-1", 5)],
        )
        .execute(USER)
        .await
        .unwrap();

        assert_eq!(
            output.applications,
            vec![ExportedApplication {
                company: "Acme".to_string(),
                role: "Engineer".to_string(),
                status: ApplicationStatus::Interviewing,
                job_url: Some("https://acme.example/jobs/1".to_string()),
                location: Some("Remote".to_string()),
                salary_range: Some("100-120k".to_string()),
                description: Some("Build things".to_string()),
                applied_at: Some(at(1_700_000_000)),
                created_at: at(1_690_000_000),
                // Newest first, and only this application's.
                notes: vec![
                    ExportedNote { content: "content of n2".to_string(), created_at: at(20) },
                    ExportedNote { content: "content of n1".to_string(), created_at: at(10) },
                ],
                documents: vec![ExportedDocument {
                    name: "d1.pdf".to_string(),
                    mime_type: "application/pdf".to_string(),
                    size_bytes: 2048,
                    created_at: at(5),
                }],
            }]
        );
    }

    #[tokio::test]
    async fn an_application_never_applied_to_has_no_applied_date() {
        let output = use_case(
            vec![user()],
            vec![application_owned_by("app-1", USER)],
            vec![],
            vec![],
        )
        .execute(USER)
        .await
        .unwrap();

        assert_eq!(output.applications[0].applied_at, None);
        assert!(output.applications[0].notes.is_empty());
        assert!(output.applications[0].documents.is_empty());
    }

    #[tokio::test]
    async fn exports_newest_first_and_leaves_out_trash_and_other_users() {
        let older = Application { created_at: at(100), ..application_owned_by("old", USER) };
        let newer = Application {
            company: "Newer".to_string(),
            created_at: at(200),
            ..application_owned_by("new", USER)
        };
        let trashed =
            Application { deleted_at: Some(at(300)), ..application_owned_by("trash", USER) };
        let foreign = application_owned_by("foreign", "user-2");

        let output = use_case(vec![user()], vec![older, newer, trashed, foreign], vec![], vec![])
            .execute(USER)
            .await
            .unwrap();

        let companies: Vec<&str> =
            output.applications.iter().map(|app| app.company.as_str()).collect();
        assert_eq!(companies, vec!["Newer", "Acme"]);
    }
}

mod import {
    use super::*;

    struct Fixture {
        applications: Arc<FakeApplicationRepository>,
        notes: Arc<FakeNoteRepository>,
    }

    impl Fixture {
        fn new() -> Self {
            Self { applications: Arc::default(), notes: Arc::default() }
        }

        async fn import(&self, data: &serde_json::Value) -> ImportSummary {
            self.import_raw(&data.to_string()).await.unwrap()
        }

        async fn import_raw(
            &self,
            raw: &str,
        ) -> crate::use_cases::errors::DomainResult<ImportSummary> {
            ImportUserDataUseCase {
                application_repository: self.applications.clone(),
                note_repository: self.notes.clone(),
                generate_id: sequential_ids("id"),
            }
            .execute(USER, raw)
            .await
        }
    }

    const NO_ARRAY: &str =
        "Import file must contain an \"applications\" array — export your data first";

    #[tokio::test]
    async fn refuses_a_payload_that_is_not_json() {
        let err = Fixture::new().import_raw("{not json").await.unwrap_err();
        assert_error(&err, ErrorCode::Validation, "Import file is not valid JSON");
    }

    #[tokio::test]
    async fn refuses_a_payload_with_no_applications_array() {
        for raw in ["{}", "[]", "null", "\"text\"", "42", r#"{"applications":{}}"#] {
            let err = Fixture::new().import_raw(raw).await.unwrap_err();
            assert_error(&err, ErrorCode::Validation, NO_ARRAY);
        }
    }

    #[tokio::test]
    async fn skips_entries_missing_a_company_or_role() {
        let fixture = Fixture::new();

        let summary = fixture
            .import(&json!({ "applications": [
                { "role": "Engineer" },
                { "company": "Acme" },
                { "company": 7, "role": "Engineer" },
                "not an object",
                null,
                [],
            ] }))
            .await;

        assert_eq!(summary, ImportSummary { applications_skipped: 6, ..ImportSummary::default() });
        assert!(fixture.applications.all().is_empty());
    }

    #[tokio::test]
    async fn skips_entries_with_a_blank_company_or_role() {
        let fixture = Fixture::new();

        let summary = fixture
            .import(&json!({ "applications": [
                { "company": "   ", "role": "Engineer" },
                { "company": "Acme", "role": "" },
            ] }))
            .await;

        assert_eq!(summary.applications_skipped, 2);
        assert_eq!(summary.applications_imported, 0);
    }

    #[tokio::test]
    async fn imports_an_application_with_a_recognised_status() {
        let fixture = Fixture::new();

        let summary = fixture
            .import(&json!({ "applications": [{
                "company": "Acme",
                "role": "Engineer",
                "status": "interviewing",
                "jobUrl": "https://acme.example/jobs/1",
                "location": "Remote",
                "salaryRange": "100-120k",
                "description": "Build things",
            }] }))
            .await;

        assert_eq!(summary, ImportSummary { applications_imported: 1, ..ImportSummary::default() });
        let stored = fixture.applications.all();
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].id, "id-1");
        assert_eq!(stored[0].user_id, USER);
        assert_eq!(stored[0].company, "Acme");
        assert_eq!(stored[0].role, "Engineer");
        assert_eq!(stored[0].status, ApplicationStatus::Interviewing);
        assert_eq!(stored[0].job_url.as_deref(), Some("https://acme.example/jobs/1"));
        assert_eq!(stored[0].location.as_deref(), Some("Remote"));
        assert_eq!(stored[0].salary_range.as_deref(), Some("100-120k"));
        assert_eq!(stored[0].description.as_deref(), Some("Build things"));
        assert_eq!(stored[0].applied_at, None);
    }

    #[tokio::test]
    async fn counts_applications_refused_by_the_quota_as_skipped_and_carries_on() {
        let fixture = Fixture::new();
        fixture.applications.set_application_count(USER, APPLICATIONS_PER_USER - 1);

        let summary = fixture
            .import(&json!({ "applications": [
                { "company": "Fits", "role": "Engineer" },
                { "company": "Over", "role": "Engineer", "notes": [{ "content": "lost" }],
                  "documents": [{}] },
                { "company": "Also over", "role": "Engineer" },
            ] }))
            .await;

        assert_eq!(
            summary,
            ImportSummary {
                applications_imported: 1,
                applications_skipped: 2,
                ..ImportSummary::default()
            }
        );
        assert!(fixture.notes.all().is_empty());
    }

    #[tokio::test]
    async fn falls_back_to_draft_for_a_missing_or_unrecognised_status() {
        let fixture = Fixture::new();

        fixture
            .import(&json!({ "applications": [
                { "company": "A", "role": "R" },
                { "company": "B", "role": "R", "status": "ghosted" },
                { "company": "C", "role": "R", "status": 3 },
            ] }))
            .await;

        assert!(fixture
            .applications
            .all()
            .iter()
            .all(|application| application.status == ApplicationStatus::Draft));
    }

    #[tokio::test]
    async fn empty_or_non_string_optional_fields_become_null() {
        let fixture = Fixture::new();

        fixture
            .import(&json!({ "applications": [{
                "company": "Acme", "role": "Engineer",
                "jobUrl": "", "location": null, "salaryRange": 5,
            }] }))
            .await;

        let stored = &fixture.applications.all()[0];
        assert_eq!(stored.job_url, None);
        assert_eq!(stored.location, None);
        assert_eq!(stored.salary_range, None);
        assert_eq!(stored.description, None);
    }

    #[tokio::test]
    async fn restores_the_applied_date_from_a_valid_date_string() {
        let fixture = Fixture::new();

        fixture
            .import(&json!({ "applications": [
                { "company": "Acme", "role": "Engineer", "appliedAt": "2024-01-15T10:00:00.000Z" },
            ] }))
            .await;

        assert_eq!(fixture.applications.all()[0].applied_at, Some(at(1_705_312_800)));
    }

    #[tokio::test]
    async fn leaves_the_applied_date_empty_when_it_is_missing_or_not_a_date() {
        let fixture = Fixture::new();

        let summary = fixture
            .import(&json!({ "applications": [
                { "company": "A", "role": "R" },
                { "company": "B", "role": "R", "appliedAt": "not a date" },
                { "company": "C", "role": "R", "appliedAt": 1705312800000_i64 },
                { "company": "D", "role": "R", "appliedAt": null },
            ] }))
            .await;

        assert_eq!(summary.applications_imported, 4);
        let stored = fixture.applications.all();
        assert!(stored.iter().all(|application| application.applied_at.is_none()));
        // No update was issued either: `updatedAt` is still the creation time.
        assert!(stored.iter().all(|application| application.updated_at == application.created_at));
    }

    #[tokio::test]
    async fn imports_valid_notes_and_skips_blank_or_malformed_ones() {
        let fixture = Fixture::new();

        let summary = fixture
            .import(&json!({ "applications": [{
                "company": "Acme", "role": "Engineer",
                "notes": [
                    { "content": "Called the recruiter", "createdAt": "2024-01-01T00:00:00.000Z" },
                    { "content": "   " },
                    { "content": 5 },
                    "just a string",
                    null,
                    { "content": " padded stays as written " },
                ],
            }] }))
            .await;

        assert_eq!(summary.notes_imported, 2);
        let notes = fixture.notes.all();
        let contents: Vec<&str> = notes.iter().map(|note| note.content.as_str()).collect();
        assert_eq!(contents, vec!["Called the recruiter", " padded stays as written "]);
        assert!(notes.iter().all(|note| note.application_id == "id-1"));
        assert_eq!(notes[0].id, "id-2");
    }

    #[tokio::test]
    async fn counts_documents_as_skipped_and_creates_none() {
        let fixture = Fixture::new();

        let summary = fixture
            .import(&json!({ "applications": [{
                "company": "Acme", "role": "Engineer",
                "documents": [
                    { "name": "cv.pdf", "mimeType": "application/pdf", "sizeBytes": 10 },
                    { "name": "letter.pdf" },
                    "anything",
                ],
            }] }))
            .await;

        assert_eq!(summary.documents_skipped, 3);
        assert_eq!(summary.applications_imported, 1);
    }

    #[tokio::test]
    async fn notes_or_documents_that_are_not_arrays_are_ignored() {
        let fixture = Fixture::new();

        let summary = fixture
            .import(&json!({ "applications": [
                { "company": "Acme", "role": "Engineer", "notes": "none", "documents": 3 },
            ] }))
            .await;

        assert_eq!(summary, ImportSummary { applications_imported: 1, ..ImportSummary::default() });
    }

    #[tokio::test]
    async fn aggregates_the_summary_across_applications() {
        let fixture = Fixture::new();

        let summary = fixture
            .import(&json!({ "applications": [
                { "company": "A", "role": "R", "notes": [{ "content": "one" }],
                  "documents": [{}, {}] },
                { "company": "", "role": "R" },
                { "company": "B", "role": "R",
                  "notes": [{ "content": "two" }, { "content": "three" }], "documents": [{}] },
            ] }))
            .await;

        assert_eq!(
            summary,
            ImportSummary {
                applications_imported: 2,
                applications_skipped: 1,
                notes_imported: 3,
                documents_skipped: 3,
            }
        );
    }
}
