pub mod confirm_document;
pub mod create_document_draft;
pub mod delete_document;
pub mod delete_document_draft;
pub mod document_validation;
pub mod export_document_draft_to_pdf;
pub mod extract_document_text;
pub mod get_document_draft;
pub mod get_document_drafts;
pub mod get_document_version_outcomes;
pub mod get_documents;
pub mod js_whitespace;
pub mod owned_draft;
pub mod rename_document_draft;
pub mod request_upload_url;
pub mod update_document_draft_content;

pub use confirm_document::{ConfirmDocumentInput, ConfirmDocumentUseCase};
pub use create_document_draft::{CreateDocumentDraftInput, CreateDocumentDraftUseCase};
pub use delete_document::{DeleteDocumentInput, DeleteDocumentUseCase};
pub use delete_document_draft::{DeleteDocumentDraftInput, DeleteDocumentDraftUseCase};
pub use export_document_draft_to_pdf::{
    ExportDocumentDraftToPdfInput, ExportDocumentDraftToPdfUseCase,
};
pub use extract_document_text::{
    ExtractDocumentTextInput, ExtractDocumentTextOutput, ExtractDocumentTextUseCase,
    FetchStoredObject,
};
pub use get_document_draft::{GetDocumentDraftInput, GetDocumentDraftUseCase};
pub use get_document_drafts::{GetDocumentDraftsInput, GetDocumentDraftsUseCase};
pub use get_document_version_outcomes::{
    DocumentVersionOutcome, GetDocumentVersionOutcomesInput, GetDocumentVersionOutcomesUseCase,
};
pub use get_documents::{GetDocumentsInput, GetDocumentsUseCase};
pub use rename_document_draft::{RenameDocumentDraftInput, RenameDocumentDraftUseCase};
pub use request_upload_url::{
    RequestUploadUrlInput, RequestUploadUrlOutput, RequestUploadUrlUseCase,
};
pub use update_document_draft_content::{
    UpdateDocumentDraftContentInput, UpdateDocumentDraftContentUseCase,
};

#[cfg(test)]
mod draft_tests;
#[cfg(test)]
mod tests;
