use std::sync::LazyLock;

use crate::http::container::Container;
use crate::infrastructure::storage::stored_object_fetcher;
use crate::use_cases::documents::{
    ConfirmDocumentUseCase, CreateDocumentDraftUseCase, DeleteDocumentDraftUseCase,
    DeleteDocumentUseCase, ExportDocumentDraftToPdfUseCase, ExtractDocumentTextUseCase,
    GetDocumentDraftUseCase, GetDocumentDraftsUseCase, GetDocumentVersionOutcomesUseCase,
    GetDocumentsUseCase, RenameDocumentDraftUseCase, RequestUploadUrlUseCase,
    UpdateDocumentDraftContentUseCase,
};

/// Reads stored objects back for text extraction. One client for the
/// process, so its connection pool is shared: the container's own client is
/// not exposed by `Services`.
static STORED_OBJECT_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(reqwest::Client::new);

impl Container {
    pub fn request_upload_url_use_case(&self) -> RequestUploadUrlUseCase {
        RequestUploadUrlUseCase {
            application_repository: self.application_repository.clone(),
            document_repository: self.document_repository.clone(),
            storage_provider: self.services.storage_provider.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn confirm_document_use_case(&self) -> ConfirmDocumentUseCase {
        ConfirmDocumentUseCase {
            application_repository: self.application_repository.clone(),
            document_repository: self.document_repository.clone(),
            activity_log_repository: self.activity_log_repository.clone(),
            storage_provider: self.services.storage_provider.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn get_documents_use_case(&self) -> GetDocumentsUseCase {
        GetDocumentsUseCase {
            application_repository: self.application_repository.clone(),
            document_repository: self.document_repository.clone(),
        }
    }

    pub fn delete_document_use_case(&self) -> DeleteDocumentUseCase {
        DeleteDocumentUseCase {
            application_repository: self.application_repository.clone(),
            document_repository: self.document_repository.clone(),
            storage_provider: self.services.storage_provider.clone(),
            activity_log_repository: self.activity_log_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn extract_document_text_use_case(&self) -> ExtractDocumentTextUseCase {
        ExtractDocumentTextUseCase {
            document_repository: self.document_repository.clone(),
            application_repository: self.application_repository.clone(),
            document_text_extractor: self.services.document_text_extractor.clone(),
            storage_provider: self.services.storage_provider.clone(),
            fetch_stored_object: stored_object_fetcher(STORED_OBJECT_CLIENT.clone()),
        }
    }

    pub fn get_document_version_outcomes_use_case(&self) -> GetDocumentVersionOutcomesUseCase {
        GetDocumentVersionOutcomesUseCase {
            document_repository: self.document_repository.clone(),
            interview_round_repository: self.interview_round_repository.clone(),
        }
    }

    pub fn create_document_draft_use_case(&self) -> CreateDocumentDraftUseCase {
        CreateDocumentDraftUseCase {
            document_draft_repository: self.document_draft_repository.clone(),
            application_repository: self.application_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn get_document_drafts_use_case(&self) -> GetDocumentDraftsUseCase {
        GetDocumentDraftsUseCase {
            document_draft_repository: self.document_draft_repository.clone(),
            application_repository: self.application_repository.clone(),
        }
    }

    pub fn get_document_draft_use_case(&self) -> GetDocumentDraftUseCase {
        GetDocumentDraftUseCase {
            document_draft_repository: self.document_draft_repository.clone(),
            application_repository: self.application_repository.clone(),
        }
    }

    pub fn update_document_draft_content_use_case(&self) -> UpdateDocumentDraftContentUseCase {
        UpdateDocumentDraftContentUseCase {
            document_draft_repository: self.document_draft_repository.clone(),
            application_repository: self.application_repository.clone(),
        }
    }

    pub fn rename_document_draft_use_case(&self) -> RenameDocumentDraftUseCase {
        RenameDocumentDraftUseCase {
            document_draft_repository: self.document_draft_repository.clone(),
            application_repository: self.application_repository.clone(),
        }
    }

    pub fn delete_document_draft_use_case(&self) -> DeleteDocumentDraftUseCase {
        DeleteDocumentDraftUseCase {
            document_draft_repository: self.document_draft_repository.clone(),
            application_repository: self.application_repository.clone(),
        }
    }

    pub fn export_document_draft_to_pdf_use_case(&self) -> ExportDocumentDraftToPdfUseCase {
        ExportDocumentDraftToPdfUseCase {
            document_draft_repository: self.document_draft_repository.clone(),
            document_repository: self.document_repository.clone(),
            application_repository: self.application_repository.clone(),
            storage_provider: self.services.storage_provider.clone(),
            pdf_renderer: self.services.pdf_renderer.clone(),
            generate_id: self.generate_id.clone(),
        }
    }
}
