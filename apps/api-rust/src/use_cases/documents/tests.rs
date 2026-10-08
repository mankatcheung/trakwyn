//! Documents: upload URLs, confirmation, listing, deletion, text extraction
//! and the version-outcome report. Drafts are in `draft_tests.rs`.

use std::sync::{Arc, Mutex};

use chrono::{DateTime, Utc};
use futures::FutureExt;

use super::*;
use crate::domain::activity_log::ActivityEventType;
use crate::domain::document::Document;
use crate::domain::interview_round::{InterviewRound, InterviewRoundType};
use crate::use_cases::constants::document_limits::DOCUMENTS_PER_APPLICATION;
use crate::use_cases::errors::{DomainError, ErrorCode};
use crate::use_cases::ports::{
    CreateInterviewRoundData, DocumentRepository, InterviewRoundRepository, StorageProvider,
};
use crate::use_cases::test_support::{
    application_owned_by, sequential_ids, FakeActivityLogRepository, FakeApplicationRepository,
    FakeDocumentRepository, FakeDocumentTextExtractor, FakeInterviewRoundRepository,
    FakeStorageProvider,
};

const OWNER: &str = "user-owner";
const STRANGER: &str = "user-stranger";
const APPLICATION: &str = "app-1";
const OWNED_KEY: &str = "users/user-owner/applications/app-1/abc-resume.pdf";

pub(super) fn document(id: &str, application_id: &str, created_at_s: i64) -> Document {
    Document {
        id: id.to_string(),
        application_id: application_id.to_string(),
        name: format!("{id}.pdf"),
        mime_type: "application/pdf".to_string(),
        size_bytes: 1024,
        storage_key: format!("users/user-owner/applications/{application_id}/{id}.pdf"),
        document_type: "other".to_string(),
        version: None,
        source_draft_id: None,
        created_at: DateTime::<Utc>::from_timestamp(created_at_s, 0).unwrap(),
    }
}

struct Fixture {
    applications: Arc<FakeApplicationRepository>,
    documents: Arc<FakeDocumentRepository>,
    storage: Arc<FakeStorageProvider>,
    activity: Arc<FakeActivityLogRepository>,
    extractor: Arc<FakeDocumentTextExtractor>,
    fetched: Arc<Mutex<Vec<String>>>,
}

impl Fixture {
    fn new(documents: Vec<Document>) -> Self {
        Self {
            applications: Arc::new(FakeApplicationRepository::with(vec![application_owned_by(
                APPLICATION,
                OWNER,
            )])),
            documents: Arc::new(FakeDocumentRepository::with(documents)),
            storage: Arc::default(),
            activity: Arc::default(),
            extractor: Arc::default(),
            fetched: Arc::default(),
        }
    }

    /// An application at its document quota.
    fn full() -> Self {
        Self::new(
            (0..DOCUMENTS_PER_APPLICATION)
                .map(|index| document(&format!("doc-{index}"), APPLICATION, i64::from(index)))
                .collect(),
        )
    }

    fn request_upload_url(&self) -> RequestUploadUrlUseCase {
        RequestUploadUrlUseCase {
            application_repository: self.applications.clone(),
            document_repository: self.documents.clone(),
            storage_provider: self.storage.clone(),
            generate_id: sequential_ids("id"),
        }
    }

    fn confirm(&self) -> ConfirmDocumentUseCase {
        ConfirmDocumentUseCase {
            application_repository: self.applications.clone(),
            document_repository: self.documents.clone(),
            activity_log_repository: self.activity.clone(),
            storage_provider: self.storage.clone(),
            generate_id: sequential_ids("id"),
        }
    }

    fn get(&self) -> GetDocumentsUseCase {
        GetDocumentsUseCase {
            application_repository: self.applications.clone(),
            document_repository: self.documents.clone(),
        }
    }

    fn delete(&self) -> DeleteDocumentUseCase {
        DeleteDocumentUseCase {
            application_repository: self.applications.clone(),
            document_repository: self.documents.clone(),
            storage_provider: self.storage.clone(),
            activity_log_repository: self.activity.clone(),
            generate_id: sequential_ids("id"),
        }
    }

    /// Text extraction whose fetch answers from the fake storage, as the
    /// URL the fake hands out (`fake-storage://<key>`) would.
    fn extract(&self) -> ExtractDocumentTextUseCase {
        let storage = self.storage.clone();
        let fetched = self.fetched.clone();
        ExtractDocumentTextUseCase {
            document_repository: self.documents.clone(),
            application_repository: self.applications.clone(),
            document_text_extractor: self.extractor.clone(),
            storage_provider: self.storage.clone(),
            fetch_stored_object: Arc::new(move |url: String| {
                fetched.lock().unwrap().push(url.clone());
                let object =
                    url.strip_prefix("fake-storage://").and_then(|key| storage.object(key));
                async move {
                    object
                        .map(|object| object.data)
                        .ok_or_else(|| DomainError::internal("Failed to read the document file"))
                }
                .boxed()
            }),
        }
    }
}

fn upload_input(user_id: &str, application_id: &str, filename: &str) -> RequestUploadUrlInput {
    RequestUploadUrlInput {
        user_id: user_id.to_string(),
        application_id: application_id.to_string(),
        filename: filename.to_string(),
        mime_type: "application/pdf".to_string(),
    }
}

fn confirm_input(user_id: &str, application_id: &str) -> ConfirmDocumentInput {
    ConfirmDocumentInput {
        user_id: user_id.to_string(),
        application_id: application_id.to_string(),
        storage_key: OWNED_KEY.to_string(),
        name: "resume.pdf".to_string(),
        mime_type: "application/pdf".to_string(),
        size_bytes: 2048,
        document_type: None,
        version: None,
    }
}

mod request_upload_url {
    use super::*;

    #[tokio::test]
    async fn returns_a_presigned_upload_url_and_the_computed_storage_key() {
        let fixture = Fixture::new(vec![]);

        let output = fixture
            .request_upload_url()
            .execute(upload_input(OWNER, APPLICATION, "resume.pdf"))
            .await
            .unwrap();

        assert_eq!(output.storage_key, "users/user-owner/applications/app-1/id-1-resume.pdf");
        assert_eq!(output.upload_url, format!("fake-upload://{}", output.storage_key));
        // Nothing is stored or recorded until the upload is confirmed.
        assert!(fixture.documents.all().is_empty());
    }

    #[tokio::test]
    async fn sanitizes_the_filename() {
        let fixture = Fixture::new(vec![]);

        let output = fixture
            .request_upload_url()
            .execute(upload_input(OWNER, APPLICATION, "my resume (final)!.pdf"))
            .await
            .unwrap();

        assert_eq!(
            output.storage_key,
            "users/user-owner/applications/app-1/id-1-my-resume-final.pdf"
        );
    }

    #[tokio::test]
    async fn a_filename_cannot_add_a_path_segment_to_the_key() {
        let fixture = Fixture::new(vec![]);

        let output = fixture
            .request_upload_url()
            .execute(upload_input(OWNER, APPLICATION, "../../other/app/x.pdf"))
            .await
            .unwrap();

        assert_eq!(
            output.storage_key,
            "users/user-owner/applications/app-1/id-1-....otherappx.pdf"
        );
    }

    #[tokio::test]
    async fn refuses_a_mime_type_outside_the_list_before_anything_else() {
        let fixture = Fixture::new(vec![]);
        let input = RequestUploadUrlInput {
            mime_type: "application/zip".to_string(),
            ..upload_input(OWNER, "missing", "a.zip")
        };

        let err = fixture.request_upload_url().execute(input).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "Unsupported file type: application/zip");
    }

    #[tokio::test]
    async fn fails_when_the_application_does_not_exist() {
        let fixture = Fixture::new(vec![]);

        let err = fixture
            .request_upload_url()
            .execute(upload_input(OWNER, "missing", "a.pdf"))
            .await
            .unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Application not found");
    }

    #[tokio::test]
    async fn refuses_someone_elses_application() {
        let fixture = Fixture::new(vec![]);

        let err = fixture
            .request_upload_url()
            .execute(upload_input(STRANGER, APPLICATION, "a.pdf"))
            .await
            .unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(err.to_string(), "Forbidden");
    }

    #[tokio::test]
    async fn refuses_an_application_that_has_reached_its_document_limit() {
        let fixture = Fixture::full();

        let err = fixture
            .request_upload_url()
            .execute(upload_input(OWNER, APPLICATION, "a.pdf"))
            .await
            .unwrap_err();

        assert_eq!(err.code(), ErrorCode::QuotaExceeded);
        assert_eq!(err.to_string(), "This application already has the maximum of 10 documents");
    }
}

mod confirm {
    use super::*;

    #[tokio::test]
    async fn creates_the_document_with_the_given_fields_and_logs_the_activity() {
        let fixture = Fixture::new(vec![]);
        fixture.storage.insert(OWNED_KEY, b"%PDF", "application/pdf");

        let created = fixture.confirm().execute(confirm_input(OWNER, APPLICATION)).await.unwrap();

        assert_eq!(created.id, "id-1");
        assert_eq!(created.application_id, APPLICATION);
        assert_eq!(created.storage_key, OWNED_KEY);
        assert_eq!(created.name, "resume.pdf");
        assert_eq!(created.mime_type, "application/pdf");
        assert_eq!(created.size_bytes, 2048);
        assert_eq!(created.document_type, "other");
        assert_eq!(created.version, None);
        assert_eq!(created.source_draft_id, None);
        assert_eq!(fixture.documents.all(), vec![created]);
        assert!(fixture.storage.contains(OWNED_KEY));

        let entries = fixture.activity.entries();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, "id-2");
        assert_eq!(entries[0].application_id, APPLICATION);
        assert_eq!(entries[0].actor_id, OWNER);
        assert_eq!(entries[0].event_type, ActivityEventType::DocumentUploaded);
        assert_eq!(entries[0].payload, r#"{"documentId":"id-1","name":"resume.pdf"}"#);
    }

    #[tokio::test]
    async fn passes_the_document_type_and_version_to_the_repository() {
        let fixture = Fixture::new(vec![]);
        let input = ConfirmDocumentInput {
            document_type: Some("resume".to_string()),
            version: Some("v3".to_string()),
            ..confirm_input(OWNER, APPLICATION)
        };

        let created = fixture.confirm().execute(input).await.unwrap();

        assert_eq!(created.document_type, "resume");
        assert_eq!(created.version.as_deref(), Some("v3"));
    }

    #[tokio::test]
    async fn refuses_a_mime_type_outside_the_list() {
        let fixture = Fixture::new(vec![]);
        let input = ConfirmDocumentInput {
            mime_type: "application/zip".to_string(),
            ..confirm_input(OWNER, APPLICATION)
        };

        let err = fixture.confirm().execute(input).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "Unsupported file type: application/zip");
        assert!(fixture.documents.all().is_empty());
        assert!(fixture.activity.entries().is_empty());
    }

    #[tokio::test]
    async fn refuses_a_size_that_is_not_positive() {
        let fixture = Fixture::new(vec![]);
        let input = ConfirmDocumentInput { size_bytes: 0, ..confirm_input(OWNER, APPLICATION) };

        let err = fixture.confirm().execute(input).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "File size must be greater than 0 bytes");
    }

    #[tokio::test]
    async fn refuses_a_size_over_the_maximum() {
        let fixture = Fixture::new(vec![]);
        let input = ConfirmDocumentInput {
            size_bytes: 10 * 1024 * 1024 + 1,
            ..confirm_input(OWNER, APPLICATION)
        };

        let err = fixture.confirm().execute(input).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "File exceeds the maximum allowed size of 10485760 bytes");
    }

    #[tokio::test]
    async fn fails_when_the_application_does_not_exist() {
        let fixture = Fixture::new(vec![]);

        let err = fixture.confirm().execute(confirm_input(OWNER, "missing")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Application not found");
    }

    #[tokio::test]
    async fn refuses_someone_elses_application_and_leaves_their_upload_alone() {
        let fixture = Fixture::new(vec![]);
        fixture.storage.insert(OWNED_KEY, b"%PDF", "application/pdf");

        let err =
            fixture.confirm().execute(confirm_input(STRANGER, APPLICATION)).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(err.to_string(), "Forbidden");
        // The key is under the owner's prefix, not the caller's.
        assert!(fixture.storage.contains(OWNED_KEY));
        assert!(fixture.documents.all().is_empty());
    }

    #[tokio::test]
    async fn a_quota_error_from_the_repository_reaches_the_client_and_removes_the_upload() {
        let fixture = Fixture::full();
        fixture.storage.insert(OWNED_KEY, b"%PDF", "application/pdf");

        let err = fixture.confirm().execute(confirm_input(OWNER, APPLICATION)).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::QuotaExceeded);
        assert_eq!(err.to_string(), "This application already has the maximum of 10 documents");
        assert!(!fixture.storage.contains(OWNED_KEY));
        assert!(fixture.activity.entries().is_empty());
    }

    #[tokio::test]
    async fn a_failed_validation_removes_the_callers_own_upload() {
        let fixture = Fixture::new(vec![]);
        fixture.storage.insert(OWNED_KEY, b"%PDF", "application/pdf");
        let input = ConfirmDocumentInput { size_bytes: -5, ..confirm_input(OWNER, APPLICATION) };

        fixture.confirm().execute(input).await.unwrap_err();

        assert!(!fixture.storage.contains(OWNED_KEY));
    }

    #[tokio::test]
    async fn a_failure_never_deletes_a_key_outside_the_callers_prefix() {
        let fixture = Fixture::full();
        let foreign = "users/user-stranger/applications/app-9/secret.pdf";
        let traversal = "users/user-owner/applications/app-1/../../../user-stranger/x.pdf";
        fixture.storage.insert(foreign, b"theirs", "application/pdf");
        fixture.storage.insert(traversal, b"theirs", "application/pdf");

        for key in [foreign, traversal] {
            let input = ConfirmDocumentInput {
                storage_key: key.to_string(),
                ..confirm_input(OWNER, APPLICATION)
            };
            fixture.confirm().execute(input).await.unwrap_err();
            assert!(fixture.storage.contains(key), "{key}");
        }
    }

    /// As in `apps/api`: the key's ownership is checked only when cleaning
    /// up after a failure, not before the record is created.
    #[tokio::test]
    async fn a_key_outside_the_callers_prefix_is_still_recorded() {
        let fixture = Fixture::new(vec![]);
        let input = ConfirmDocumentInput {
            storage_key: "users/user-stranger/applications/app-9/secret.pdf".to_string(),
            ..confirm_input(OWNER, APPLICATION)
        };

        let created = fixture.confirm().execute(input).await.unwrap();

        assert_eq!(created.storage_key, "users/user-stranger/applications/app-9/secret.pdf");
    }
}

mod get {
    use super::*;

    #[tokio::test]
    async fn returns_the_applications_documents_newest_first() {
        let fixture = Fixture::new(vec![
            document("old", APPLICATION, 100),
            document("new", APPLICATION, 200),
            document("elsewhere", "app-2", 300),
        ]);

        let documents = fixture
            .get()
            .execute(GetDocumentsInput {
                user_id: OWNER.to_string(),
                application_id: APPLICATION.to_string(),
            })
            .await
            .unwrap();

        let ids: Vec<&str> = documents.iter().map(|document| document.id.as_str()).collect();
        assert_eq!(ids, vec!["new", "old"]);
    }

    #[tokio::test]
    async fn fails_when_the_application_does_not_exist() {
        let fixture = Fixture::new(vec![]);

        let err = fixture
            .get()
            .execute(GetDocumentsInput {
                user_id: OWNER.to_string(),
                application_id: "missing".to_string(),
            })
            .await
            .unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Application not found");
    }

    #[tokio::test]
    async fn refuses_someone_elses_application() {
        let fixture = Fixture::new(vec![document("doc-1", APPLICATION, 100)]);

        let err = fixture
            .get()
            .execute(GetDocumentsInput {
                user_id: STRANGER.to_string(),
                application_id: APPLICATION.to_string(),
            })
            .await
            .unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(err.to_string(), "Forbidden");
    }
}

mod delete {
    use super::*;

    fn input(user_id: &str, document_id: &str) -> DeleteDocumentInput {
        DeleteDocumentInput { user_id: user_id.to_string(), document_id: document_id.to_string() }
    }

    #[tokio::test]
    async fn removes_the_file_and_the_record_and_logs_the_activity() {
        let stored = document("doc-1", APPLICATION, 100);
        let fixture = Fixture::new(vec![stored.clone()]);
        fixture.storage.insert(&stored.storage_key, b"%PDF", "application/pdf");

        fixture.delete().execute(input(OWNER, "doc-1")).await.unwrap();

        assert!(!fixture.storage.contains(&stored.storage_key));
        assert!(fixture.documents.all().is_empty());
        assert_eq!(fixture.documents.document_count(APPLICATION), 0);

        let entries = fixture.activity.entries();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, "id-1");
        assert_eq!(entries[0].application_id, APPLICATION);
        assert_eq!(entries[0].actor_id, OWNER);
        assert_eq!(entries[0].event_type, ActivityEventType::DocumentDeleted);
        assert_eq!(entries[0].payload, r#"{"documentId":"doc-1","name":"doc-1.pdf"}"#);
    }

    #[tokio::test]
    async fn fails_when_the_document_does_not_exist() {
        let fixture = Fixture::new(vec![]);

        let err = fixture.delete().execute(input(OWNER, "missing")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Document not found");
    }

    #[tokio::test]
    async fn refuses_a_document_on_someone_elses_application() {
        let stored = document("doc-1", APPLICATION, 100);
        let fixture = Fixture::new(vec![stored.clone()]);
        fixture.storage.insert(&stored.storage_key, b"%PDF", "application/pdf");

        let err = fixture.delete().execute(input(STRANGER, "doc-1")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(err.to_string(), "Forbidden");
        assert!(fixture.storage.contains(&stored.storage_key));
        assert_eq!(fixture.documents.all(), vec![stored]);
        assert!(fixture.activity.entries().is_empty());
    }

    #[tokio::test]
    async fn refuses_a_document_whose_application_is_gone() {
        let fixture = Fixture::new(vec![document("orphan", "app-gone", 100)]);

        let err = fixture.delete().execute(input(OWNER, "orphan")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
    }
}

mod extract_text {
    use super::*;

    fn input(user_id: &str, document_id: &str) -> ExtractDocumentTextInput {
        ExtractDocumentTextInput {
            user_id: user_id.to_string(),
            document_id: document_id.to_string(),
        }
    }

    #[tokio::test]
    async fn fetches_the_file_from_its_signed_url_and_extracts_its_text() {
        let stored = document("doc-1", APPLICATION, 100);
        let fixture = Fixture::new(vec![stored.clone()]);
        fixture.storage.insert(&stored.storage_key, b"%PDF bytes", "application/pdf");

        let output = fixture.extract().execute(input(OWNER, "doc-1")).await.unwrap();

        assert_eq!(output.text, "extracted resume text");
        let signed_url = fixture.storage.get_signed_url(&stored.storage_key, None).await.unwrap();
        assert_eq!(*fixture.fetched.lock().unwrap(), vec![signed_url]);
        let calls = fixture.extractor.calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].bytes, b"%PDF bytes");
        assert_eq!(calls[0].mime_type, "application/pdf");
    }

    #[tokio::test]
    async fn fails_when_the_document_does_not_exist() {
        let fixture = Fixture::new(vec![]);

        let err = fixture.extract().execute(input(OWNER, "missing")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Document not found");
    }

    #[tokio::test]
    async fn refuses_a_document_on_someone_elses_application_without_reading_it() {
        let stored = document("doc-1", APPLICATION, 100);
        let fixture = Fixture::new(vec![stored.clone()]);
        fixture.storage.insert(&stored.storage_key, b"%PDF bytes", "application/pdf");

        let err = fixture.extract().execute(input(STRANGER, "doc-1")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(err.to_string(), "Not authorized");
        assert!(fixture.fetched.lock().unwrap().is_empty());
        assert!(fixture.extractor.calls().is_empty());
    }

    #[tokio::test]
    async fn refuses_a_document_whose_application_is_gone() {
        let fixture = Fixture::new(vec![document("orphan", "app-gone", 100)]);

        let err = fixture.extract().execute(input(OWNER, "orphan")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
    }

    #[tokio::test]
    async fn a_file_that_cannot_be_read_is_an_internal_error() {
        // The record exists; nothing was ever stored at its key.
        let fixture = Fixture::new(vec![document("doc-1", APPLICATION, 100)]);

        let err = fixture.extract().execute(input(OWNER, "doc-1")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::InternalError);
        assert!(fixture.extractor.calls().is_empty());
    }

    #[tokio::test]
    async fn an_extractor_failure_reaches_the_caller() {
        let stored = document("doc-1", APPLICATION, 100);
        let mut fixture = Fixture::new(vec![stored.clone()]);
        fixture.storage.insert(&stored.storage_key, b"png", "image/png");
        fixture.extractor = Arc::new(
            FakeDocumentTextExtractor::default()
                .then_error(DomainError::validation("Unsupported file type for text extraction")),
        );

        let err = fixture.extract().execute(input(OWNER, "doc-1")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
    }
}

mod version_outcomes {
    use super::*;

    struct Outcomes {
        applications: Arc<FakeApplicationRepository>,
        documents: FakeDocumentRepository,
        interviews: Arc<FakeInterviewRoundRepository>,
    }

    impl Outcomes {
        /// `app-1` to `app-9`, all the owner's.
        fn new(documents: Vec<Document>) -> Self {
            let applications = Arc::new(FakeApplicationRepository::with(
                (1..=9).map(|n| application_owned_by(&format!("app-{n}"), OWNER)).collect(),
            ));
            let mut repository = FakeDocumentRepository::with(documents);
            for n in 1..=9 {
                repository = repository.owned_by(&format!("app-{n}"), OWNER);
            }
            Self {
                interviews: Arc::new(
                    FakeInterviewRoundRepository::default().with_applications(applications.clone()),
                ),
                applications,
                documents: repository,
            }
        }

        async fn interviewed(self, application_id: &str) -> Self {
            let _: InterviewRound = self
                .interviews
                .create(CreateInterviewRoundData {
                    id: format!("round-{}-{}", application_id, self.interviews.all().len()),
                    application_id: application_id.to_string(),
                    r#type: InterviewRoundType::Phone,
                    scheduled_at: None,
                    completed_at: None,
                    interviewer_name: None,
                    notes: None,
                    outcome: None,
                })
                .await
                .unwrap();
            self
        }

        async fn run(self) -> Vec<DocumentVersionOutcome> {
            // The applications fake is what the interview fake joins on.
            let _ = &self.applications;
            GetDocumentVersionOutcomesUseCase {
                document_repository: Arc::new(self.documents),
                interview_round_repository: self.interviews,
            }
            .execute(GetDocumentVersionOutcomesInput { user_id: OWNER.to_string() })
            .await
            .unwrap()
        }
    }

    fn versioned(
        id: &str,
        application_id: &str,
        document_type: &str,
        version: Option<&str>,
    ) -> Document {
        Document {
            document_type: document_type.to_string(),
            version: version.map(str::to_string),
            storage_key: format!("key-{id}"),
            ..document(id, application_id, 100)
        }
    }

    fn outcome(
        document_type: &str,
        version: Option<&str>,
        application_count: i32,
        interview_count: i32,
        interview_rate: i32,
    ) -> DocumentVersionOutcome {
        DocumentVersionOutcome {
            document_type: document_type.to_string(),
            version: version.map(str::to_string),
            application_count,
            interview_count,
            interview_rate,
        }
    }

    #[tokio::test]
    async fn returns_nothing_when_the_user_has_no_documents() {
        assert_eq!(Outcomes::new(vec![]).run().await, vec![]);
    }

    #[tokio::test]
    async fn groups_by_type_and_version_counting_distinct_applications() {
        let outcomes = Outcomes::new(vec![
            versioned("doc-1", "app-1", "resume", Some("v3")),
            versioned("doc-2", "app-2", "resume", Some("v3")),
            versioned("doc-3", "app-3", "resume", Some("v2")),
        ])
        .run()
        .await;

        assert_eq!(
            outcomes,
            vec![outcome("resume", Some("v3"), 2, 0, 0), outcome("resume", Some("v2"), 1, 0, 0)]
        );
    }

    #[tokio::test]
    async fn an_application_counts_as_an_interview_once_it_has_a_round() {
        let outcomes = Outcomes::new(vec![
            versioned("doc-1", "app-1", "resume", Some("v3")),
            versioned("doc-2", "app-2", "resume", Some("v3")),
            versioned("doc-3", "app-3", "resume", Some("v3")),
        ])
        .interviewed("app-1")
        .await
        // A second round on the same application is still one interview.
        .interviewed("app-1")
        .await
        .run()
        .await;

        assert_eq!(outcomes, vec![outcome("resume", Some("v3"), 3, 1, 33)]);
    }

    #[tokio::test]
    async fn the_rate_rounds_to_the_nearest_whole_percent() {
        let outcomes = Outcomes::new(vec![
            versioned("doc-1", "app-1", "resume", Some("v3")),
            versioned("doc-2", "app-2", "resume", Some("v3")),
            versioned("doc-3", "app-3", "resume", Some("v3")),
        ])
        .interviewed("app-1")
        .await
        .interviewed("app-2")
        .await
        .run()
        .await;

        assert_eq!(outcomes, vec![outcome("resume", Some("v3"), 3, 2, 67)]);
    }

    #[tokio::test]
    async fn several_documents_of_one_version_on_one_application_count_once() {
        let outcomes = Outcomes::new(vec![
            versioned("doc-1", "app-1", "resume", Some("v3")),
            versioned("doc-2", "app-1", "resume", Some("v3")),
        ])
        .interviewed("app-1")
        .await
        .run()
        .await;

        assert_eq!(outcomes, vec![outcome("resume", Some("v3"), 1, 1, 100)]);
    }

    #[tokio::test]
    async fn documents_with_no_version_are_grouped_under_none() {
        let outcomes = Outcomes::new(vec![
            versioned("doc-1", "app-1", "resume", None),
            versioned("doc-2", "app-2", "resume", None),
        ])
        .run()
        .await;

        assert_eq!(outcomes, vec![outcome("resume", None, 2, 0, 0)]);
    }

    /// As in `apps/api`, whose grouping key is the version or the empty
    /// string: the group reports the spelling of the first document seen
    /// (the repository lists newest first).
    #[tokio::test]
    async fn an_empty_version_joins_the_group_with_no_version() {
        let outcomes = Outcomes::new(vec![
            Document {
                created_at: DateTime::<Utc>::from_timestamp(200, 0).unwrap(),
                ..versioned("doc-1", "app-1", "resume", Some(""))
            },
            versioned("doc-2", "app-2", "resume", None),
        ])
        .run()
        .await;

        assert_eq!(outcomes, vec![outcome("resume", Some(""), 2, 0, 0)]);
    }

    #[tokio::test]
    async fn a_resume_and_a_cover_letter_of_one_version_name_stay_separate() {
        let outcomes = Outcomes::new(vec![
            Document {
                created_at: DateTime::<Utc>::from_timestamp(200, 0).unwrap(),
                ..versioned("doc-1", "app-1", "resume", Some("v1"))
            },
            versioned("doc-2", "app-1", "cover_letter", Some("v1")),
        ])
        .run()
        .await;

        assert_eq!(
            outcomes,
            vec![
                outcome("resume", Some("v1"), 1, 0, 0),
                outcome("cover_letter", Some("v1"), 1, 0, 0)
            ]
        );
    }

    #[tokio::test]
    async fn other_document_types_are_left_out() {
        let outcomes = Outcomes::new(vec![
            versioned("doc-1", "app-1", "portfolio", Some("v1")),
            versioned("doc-2", "app-2", "other", None),
            versioned("doc-3", "app-3", "resume", Some("v1")),
        ])
        .run()
        .await;

        assert_eq!(outcomes, vec![outcome("resume", Some("v1"), 1, 0, 0)]);
    }

    #[tokio::test]
    async fn groups_are_sorted_by_application_count_descending() {
        let outcomes = Outcomes::new(vec![
            versioned("doc-1", "app-1", "resume", Some("small")),
            versioned("doc-2", "app-2", "resume", Some("large")),
            versioned("doc-3", "app-3", "resume", Some("large")),
            versioned("doc-4", "app-4", "resume", Some("large")),
            versioned("doc-5", "app-5", "resume", Some("medium")),
            versioned("doc-6", "app-6", "resume", Some("medium")),
        ])
        .run()
        .await;

        let versions: Vec<Option<&str>> =
            outcomes.iter().map(|outcome| outcome.version.as_deref()).collect();
        assert_eq!(versions, vec![Some("large"), Some("medium"), Some("small")]);
    }

    #[tokio::test]
    async fn someone_elses_documents_are_not_counted() {
        let documents =
            FakeDocumentRepository::with(vec![versioned("doc-1", "app-1", "resume", Some("v1"))])
                .owned_by("app-1", STRANGER);
        let documents: Arc<dyn DocumentRepository> = Arc::new(documents);

        let outcomes = GetDocumentVersionOutcomesUseCase {
            document_repository: documents,
            interview_round_repository: Arc::new(FakeInterviewRoundRepository::default()),
        }
        .execute(GetDocumentVersionOutcomesInput { user_id: OWNER.to_string() })
        .await
        .unwrap();

        assert!(outcomes.is_empty());
    }
}
