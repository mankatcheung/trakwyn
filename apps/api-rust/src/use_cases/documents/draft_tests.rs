//! Document drafts: create, read, edit, rename, delete and export to PDF.

use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::tests::document;
use super::*;
use crate::domain::document_draft::{DocumentDraft, DocumentDraftType};
use crate::use_cases::constants::document_limits::DOCUMENTS_PER_APPLICATION;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::ports::PdfRenderData;
use crate::use_cases::test_support::{
    application_owned_by, sequential_ids, FakeApplicationRepository, FakeDocumentDraftRepository,
    FakeDocumentRepository, FakePdfRenderer, FakeStorageProvider,
};

const OWNER: &str = "user-owner";
const STRANGER: &str = "user-stranger";
const APPLICATION: &str = "app-1";

fn draft(id: &str, application_id: &str, updated_at_s: i64) -> DocumentDraft {
    let timestamp = DateTime::<Utc>::from_timestamp(updated_at_s, 0).unwrap();
    DocumentDraft {
        id: id.to_string(),
        application_id: application_id.to_string(),
        draft_type: DocumentDraftType::CoverLetter,
        title: "Cover Letter - Acme".to_string(),
        content_json: r#"{"type":"doc","content":[]}"#.to_string(),
        plain_text: "Dear Acme".to_string(),
        source_document_id: None,
        created_at: timestamp,
        updated_at: timestamp,
    }
}

struct Fixture {
    applications: Arc<FakeApplicationRepository>,
    drafts: Arc<FakeDocumentDraftRepository>,
    documents: Arc<FakeDocumentRepository>,
    storage: Arc<FakeStorageProvider>,
    renderer: Arc<FakePdfRenderer>,
}

impl Fixture {
    fn new(drafts: Vec<DocumentDraft>) -> Self {
        Self {
            applications: Arc::new(FakeApplicationRepository::with(vec![application_owned_by(
                APPLICATION,
                OWNER,
            )])),
            drafts: Arc::new(FakeDocumentDraftRepository::with(drafts)),
            documents: Arc::default(),
            storage: Arc::default(),
            renderer: Arc::default(),
        }
    }

    fn create(&self) -> CreateDocumentDraftUseCase {
        CreateDocumentDraftUseCase {
            document_draft_repository: self.drafts.clone(),
            application_repository: self.applications.clone(),
            generate_id: sequential_ids("id"),
        }
    }

    fn list(&self) -> GetDocumentDraftsUseCase {
        GetDocumentDraftsUseCase {
            document_draft_repository: self.drafts.clone(),
            application_repository: self.applications.clone(),
        }
    }

    fn get(&self) -> GetDocumentDraftUseCase {
        GetDocumentDraftUseCase {
            document_draft_repository: self.drafts.clone(),
            application_repository: self.applications.clone(),
        }
    }

    fn update(&self) -> UpdateDocumentDraftContentUseCase {
        UpdateDocumentDraftContentUseCase {
            document_draft_repository: self.drafts.clone(),
            application_repository: self.applications.clone(),
        }
    }

    fn rename(&self) -> RenameDocumentDraftUseCase {
        RenameDocumentDraftUseCase {
            document_draft_repository: self.drafts.clone(),
            application_repository: self.applications.clone(),
        }
    }

    fn delete(&self) -> DeleteDocumentDraftUseCase {
        DeleteDocumentDraftUseCase {
            document_draft_repository: self.drafts.clone(),
            application_repository: self.applications.clone(),
        }
    }

    fn export(&self) -> ExportDocumentDraftToPdfUseCase {
        ExportDocumentDraftToPdfUseCase {
            document_draft_repository: self.drafts.clone(),
            document_repository: self.documents.clone(),
            application_repository: self.applications.clone(),
            storage_provider: self.storage.clone(),
            pdf_renderer: self.renderer.clone(),
            generate_id: sequential_ids("id"),
        }
    }
}

mod create {
    use super::*;

    fn input(user_id: &str, application_id: &str) -> CreateDocumentDraftInput {
        CreateDocumentDraftInput {
            user_id: user_id.to_string(),
            application_id: application_id.to_string(),
            draft_type: DocumentDraftType::Resume,
            title: "Resume - Acme".to_string(),
            content_json: Some(r#"{"type":"doc"}"#.to_string()),
            plain_text: Some("Experience".to_string()),
            source_document_id: Some("doc-7".to_string()),
        }
    }

    #[tokio::test]
    async fn creates_a_draft_with_the_given_data() {
        let fixture = Fixture::new(vec![]);

        let created = fixture.create().execute(input(OWNER, APPLICATION)).await.unwrap();

        assert_eq!(created.id, "id-1");
        assert_eq!(created.application_id, APPLICATION);
        assert_eq!(created.draft_type, DocumentDraftType::Resume);
        assert_eq!(created.title, "Resume - Acme");
        assert_eq!(created.content_json, r#"{"type":"doc"}"#);
        assert_eq!(created.plain_text, "Experience");
        assert_eq!(created.source_document_id.as_deref(), Some("doc-7"));
        assert_eq!(fixture.drafts.all(), vec![created]);
    }

    #[tokio::test]
    async fn content_left_out_takes_the_column_defaults() {
        let fixture = Fixture::new(vec![]);
        let input = CreateDocumentDraftInput {
            content_json: None,
            plain_text: None,
            source_document_id: None,
            ..input(OWNER, APPLICATION)
        };

        let created = fixture.create().execute(input).await.unwrap();

        assert_eq!(created.content_json, "{}");
        assert_eq!(created.plain_text, "");
        assert_eq!(created.source_document_id, None);
    }

    #[tokio::test]
    async fn fails_when_the_application_does_not_exist() {
        let fixture = Fixture::new(vec![]);

        let err = fixture.create().execute(input(OWNER, "missing")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Application not found");
    }

    #[tokio::test]
    async fn someone_elses_application_is_reported_as_missing() {
        let fixture = Fixture::new(vec![]);

        let err = fixture.create().execute(input(STRANGER, APPLICATION)).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Application not found");
        assert!(fixture.drafts.all().is_empty());
    }
}

mod list {
    use super::*;

    fn input(user_id: &str, application_id: &str) -> GetDocumentDraftsInput {
        GetDocumentDraftsInput {
            user_id: user_id.to_string(),
            application_id: application_id.to_string(),
        }
    }

    #[tokio::test]
    async fn returns_the_applications_drafts_most_recently_updated_first() {
        let fixture = Fixture::new(vec![
            draft("stale", APPLICATION, 100),
            draft("fresh", APPLICATION, 200),
            draft("elsewhere", "app-2", 300),
        ]);

        let drafts = fixture.list().execute(input(OWNER, APPLICATION)).await.unwrap();

        let ids: Vec<&str> = drafts.iter().map(|draft| draft.id.as_str()).collect();
        assert_eq!(ids, vec!["fresh", "stale"]);
    }

    #[tokio::test]
    async fn a_missing_or_foreign_application_is_not_found() {
        let fixture = Fixture::new(vec![draft("d1", APPLICATION, 100)]);

        for (user_id, application_id) in [(OWNER, "missing"), (STRANGER, APPLICATION)] {
            let err = fixture.list().execute(input(user_id, application_id)).await.unwrap_err();
            assert_eq!(err.code(), ErrorCode::NotFound, "{user_id} {application_id}");
            assert_eq!(err.to_string(), "Application not found");
        }
    }
}

mod get {
    use super::*;

    fn input(user_id: &str, draft_id: &str) -> GetDocumentDraftInput {
        GetDocumentDraftInput { user_id: user_id.to_string(), draft_id: draft_id.to_string() }
    }

    #[tokio::test]
    async fn returns_the_draft() {
        let stored = draft("d1", APPLICATION, 100);
        let fixture = Fixture::new(vec![stored.clone()]);

        assert_eq!(fixture.get().execute(input(OWNER, "d1")).await.unwrap(), stored);
    }

    #[tokio::test]
    async fn fails_when_the_draft_does_not_exist() {
        let fixture = Fixture::new(vec![]);

        let err = fixture.get().execute(input(OWNER, "missing")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Document draft not found");
    }

    #[tokio::test]
    async fn refuses_a_draft_on_someone_elses_application() {
        let fixture = Fixture::new(vec![draft("d1", APPLICATION, 100)]);

        let err = fixture.get().execute(input(STRANGER, "d1")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(err.to_string(), "Not authorized");
    }

    #[tokio::test]
    async fn refuses_a_draft_whose_application_is_gone() {
        let fixture = Fixture::new(vec![draft("orphan", "app-gone", 100)]);

        let err = fixture.get().execute(input(OWNER, "orphan")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
    }
}

mod update_content {
    use super::*;

    fn input(user_id: &str, draft_id: &str) -> UpdateDocumentDraftContentInput {
        UpdateDocumentDraftContentInput {
            user_id: user_id.to_string(),
            draft_id: draft_id.to_string(),
            content_json: r#"{"type":"doc","content":[1]}"#.to_string(),
            plain_text: "Dear hiring manager".to_string(),
        }
    }

    #[tokio::test]
    async fn replaces_the_content_and_leaves_the_title_alone() {
        let fixture = Fixture::new(vec![draft("d1", APPLICATION, 100)]);

        let updated = fixture.update().execute(input(OWNER, "d1")).await.unwrap();

        assert_eq!(updated.content_json, r#"{"type":"doc","content":[1]}"#);
        assert_eq!(updated.plain_text, "Dear hiring manager");
        assert_eq!(updated.title, "Cover Letter - Acme");
        assert_eq!(fixture.drafts.all(), vec![updated]);
    }

    #[tokio::test]
    async fn fails_when_the_draft_does_not_exist() {
        let fixture = Fixture::new(vec![]);

        let err = fixture.update().execute(input(OWNER, "missing")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Document draft not found");
    }

    #[tokio::test]
    async fn refuses_a_draft_on_someone_elses_application() {
        let stored = draft("d1", APPLICATION, 100);
        let fixture = Fixture::new(vec![stored.clone()]);

        let err = fixture.update().execute(input(STRANGER, "d1")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(err.to_string(), "Not authorized");
        assert_eq!(fixture.drafts.all(), vec![stored]);
    }
}

mod rename {
    use super::*;

    fn input(user_id: &str, draft_id: &str, title: &str) -> RenameDocumentDraftInput {
        RenameDocumentDraftInput {
            user_id: user_id.to_string(),
            draft_id: draft_id.to_string(),
            title: title.to_string(),
        }
    }

    #[tokio::test]
    async fn renames_the_draft_and_leaves_the_content_alone() {
        let fixture = Fixture::new(vec![draft("d1", APPLICATION, 100)]);

        let renamed = fixture.rename().execute(input(OWNER, "d1", "Final letter")).await.unwrap();

        assert_eq!(renamed.title, "Final letter");
        assert_eq!(renamed.plain_text, "Dear Acme");
    }

    #[tokio::test]
    async fn trims_surrounding_whitespace() {
        let fixture = Fixture::new(vec![draft("d1", APPLICATION, 100)]);

        let renamed =
            fixture.rename().execute(input(OWNER, "d1", "  Final letter \n")).await.unwrap();

        assert_eq!(renamed.title, "Final letter");
    }

    #[tokio::test]
    async fn refuses_a_blank_title_before_looking_the_draft_up() {
        let fixture = Fixture::new(vec![]);

        let err = fixture.rename().execute(input(OWNER, "missing", " \t ")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "Title is required");
    }

    #[tokio::test]
    async fn fails_when_the_draft_does_not_exist() {
        let fixture = Fixture::new(vec![]);

        let err = fixture.rename().execute(input(OWNER, "missing", "Title")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Document draft not found");
    }

    #[tokio::test]
    async fn refuses_a_draft_on_someone_elses_application() {
        let stored = draft("d1", APPLICATION, 100);
        let fixture = Fixture::new(vec![stored.clone()]);

        let err = fixture.rename().execute(input(STRANGER, "d1", "Mine now")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(err.to_string(), "Not authorized");
        assert_eq!(fixture.drafts.all(), vec![stored]);
    }
}

mod delete {
    use super::*;

    fn input(user_id: &str, draft_id: &str) -> DeleteDocumentDraftInput {
        DeleteDocumentDraftInput { user_id: user_id.to_string(), draft_id: draft_id.to_string() }
    }

    #[tokio::test]
    async fn deletes_the_draft() {
        let fixture =
            Fixture::new(vec![draft("d1", APPLICATION, 100), draft("d2", APPLICATION, 5)]);

        fixture.delete().execute(input(OWNER, "d1")).await.unwrap();

        let ids: Vec<String> = fixture.drafts.all().into_iter().map(|draft| draft.id).collect();
        assert_eq!(ids, vec!["d2"]);
    }

    #[tokio::test]
    async fn fails_when_the_draft_does_not_exist() {
        let fixture = Fixture::new(vec![]);

        let err = fixture.delete().execute(input(OWNER, "missing")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Document draft not found");
    }

    #[tokio::test]
    async fn refuses_a_draft_on_someone_elses_application() {
        let fixture = Fixture::new(vec![draft("d1", APPLICATION, 100)]);

        let err = fixture.delete().execute(input(STRANGER, "d1")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(err.to_string(), "Not authorized");
        assert_eq!(fixture.drafts.all().len(), 1);
    }
}

mod export_to_pdf {
    use super::*;

    fn input(user_id: &str, draft_id: &str) -> ExportDocumentDraftToPdfInput {
        ExportDocumentDraftToPdfInput {
            user_id: user_id.to_string(),
            draft_id: draft_id.to_string(),
        }
    }

    #[tokio::test]
    async fn renders_the_pdf_stores_it_and_records_a_document_linked_to_the_draft() {
        let stored = draft("d1", APPLICATION, 100);
        let fixture = Fixture::new(vec![stored.clone()]);

        let exported = fixture.export().execute(input(OWNER, "d1")).await.unwrap();

        let render = PdfRenderData {
            title: stored.title.clone(),
            content_json: stored.content_json.clone(),
        };
        let pdf = FakePdfRenderer::bytes_for(&render);
        assert_eq!(fixture.renderer.rendered(), vec![render]);

        assert_eq!(exported.id, "id-1");
        assert_eq!(exported.application_id, APPLICATION);
        assert_eq!(exported.storage_key, "documents/app-1/id-1.pdf");
        assert_eq!(exported.name, "Cover_Letter___Acme.pdf");
        assert_eq!(exported.mime_type, "application/pdf");
        assert_eq!(exported.size_bytes, pdf.len() as i32);
        assert_eq!(exported.document_type, "cover_letter");
        assert_eq!(exported.version, None);
        assert_eq!(exported.source_draft_id.as_deref(), Some("d1"));
        assert_eq!(fixture.documents.all(), vec![exported]);

        let object = fixture.storage.object("documents/app-1/id-1.pdf").unwrap();
        assert_eq!(object.data, pdf);
        assert_eq!(object.mime_type, "application/pdf");
        // The draft stays: an export is a copy.
        assert_eq!(fixture.drafts.all(), vec![stored]);
    }

    #[tokio::test]
    async fn a_resume_draft_exports_as_a_resume() {
        let stored = DocumentDraft {
            draft_type: DocumentDraftType::Resume,
            ..draft("d1", APPLICATION, 100)
        };
        let fixture = Fixture::new(vec![stored]);

        let exported = fixture.export().execute(input(OWNER, "d1")).await.unwrap();

        assert_eq!(exported.document_type, "resume");
    }

    #[tokio::test]
    async fn fails_when_the_draft_does_not_exist() {
        let fixture = Fixture::new(vec![]);

        let err = fixture.export().execute(input(OWNER, "missing")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Document draft not found");
    }

    #[tokio::test]
    async fn refuses_a_draft_on_someone_elses_application_without_rendering() {
        let fixture = Fixture::new(vec![draft("d1", APPLICATION, 100)]);

        let err = fixture.export().execute(input(STRANGER, "d1")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(err.to_string(), "Not authorized");
        assert!(fixture.renderer.rendered().is_empty());
        assert!(fixture.storage.keys().is_empty());
    }

    #[tokio::test]
    async fn a_failed_render_stores_nothing() {
        let mut fixture = Fixture::new(vec![draft("d1", APPLICATION, 100)]);
        fixture.renderer = Arc::new(FakePdfRenderer::failing());

        let err = fixture.export().execute(input(OWNER, "d1")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::InternalError);
        assert!(fixture.storage.keys().is_empty());
        assert!(fixture.documents.all().is_empty());
    }

    #[tokio::test]
    async fn the_rendered_pdf_is_deleted_when_the_document_quota_refuses_it() {
        let mut fixture = Fixture::new(vec![draft("d1", APPLICATION, 100)]);
        fixture.documents = Arc::new(FakeDocumentRepository::with(
            (0..DOCUMENTS_PER_APPLICATION)
                .map(|index| document(&format!("doc-{index}"), APPLICATION, i64::from(index)))
                .collect(),
        ));

        let err = fixture.export().execute(input(OWNER, "d1")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::QuotaExceeded);
        assert_eq!(err.to_string(), "This application already has the maximum of 10 documents");
        assert!(fixture.storage.keys().is_empty());
        assert_eq!(fixture.documents.all().len(), DOCUMENTS_PER_APPLICATION as usize);
    }
}
