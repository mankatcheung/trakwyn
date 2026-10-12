use std::sync::Arc;

use super::owned_draft::find_owned_draft;
use crate::domain::document::Document;
use crate::use_cases::constants::mime_type;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    ApplicationRepository, CreateDocumentData, DocumentDraftRepository, DocumentRepository,
    PdfRenderData, PdfRenderer, StorageProvider,
};

pub struct ExportDocumentDraftToPdfInput {
    pub user_id: String,
    pub draft_id: String,
}

pub struct ExportDocumentDraftToPdfUseCase {
    pub document_draft_repository: Arc<dyn DocumentDraftRepository>,
    pub document_repository: Arc<dyn DocumentRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub storage_provider: Arc<dyn StorageProvider>,
    pub pdf_renderer: Arc<dyn PdfRenderer>,
    pub generate_id: GenerateId,
}

/// The draft's title with everything outside `[a-zA-Z0-9]` replaced by `_`,
/// plus `.pdf`. The original replaces per UTF-16 code unit, so a character
/// outside the Basic Multilingual Plane becomes two underscores.
fn pdf_file_name(title: &str) -> String {
    let mut name = String::with_capacity(title.len() + 4);
    for character in title.chars() {
        if character.is_ascii_alphanumeric() {
            name.push(character);
        } else {
            for _ in 0..character.len_utf16() {
                name.push('_');
            }
        }
    }
    name.push_str(".pdf");
    name
}

impl ExportDocumentDraftToPdfUseCase {
    pub async fn execute(&self, input: ExportDocumentDraftToPdfInput) -> DomainResult<Document> {
        let draft = find_owned_draft(
            self.document_draft_repository.as_ref(),
            self.application_repository.as_ref(),
            &input.draft_id,
            &input.user_id,
        )
        .await?;

        let pdf = self
            .pdf_renderer
            .render(PdfRenderData {
                title: draft.title.clone(),
                content_json: draft.content_json.clone(),
            })
            .await?;

        let document_id = (self.generate_id)();
        let storage_key = format!("documents/{}/{document_id}.pdf", draft.application_id);
        let size_bytes = i32::try_from(pdf.len()).map_err(DomainError::internal)?;

        self.storage_provider.put_object(&storage_key, &pdf, mime_type::PDF).await?;

        let created = self
            .document_repository
            .create(CreateDocumentData {
                id: document_id,
                application_id: draft.application_id,
                name: pdf_file_name(&draft.title),
                mime_type: mime_type::PDF.to_string(),
                size_bytes,
                storage_key: storage_key.clone(),
                document_type: Some(draft.draft_type.as_str().to_string()),
                version: None,
                source_draft_id: Some(draft.id),
            })
            .await;

        match created {
            Ok(document) => Ok(document),
            Err(error) => {
                // The quota is checked by the insert, after the upload: take
                // the rendered file back out rather than orphan it.
                self.storage_provider.delete(&storage_key).await?;
                Err(error)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_file_after_the_title_with_underscores() {
        assert_eq!(pdf_file_name("Cover Letter - Acme"), "Cover_Letter___Acme.pdf");
        assert_eq!(pdf_file_name("r\u{00E9}sum\u{00E9}.v2"), "r_sum__v2.pdf");
        assert_eq!(pdf_file_name(""), ".pdf");
    }

    #[test]
    fn a_character_outside_the_bmp_becomes_two_underscores() {
        assert_eq!(pdf_file_name("a\u{1F600}b"), "a__b.pdf");
    }
}
