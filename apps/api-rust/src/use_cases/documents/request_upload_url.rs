use std::sync::Arc;

use super::document_validation::assert_allowed_mime_type;
use super::js_whitespace::is_js_whitespace;
use crate::use_cases::constants::document_limits::DOCUMENTS_PER_APPLICATION;
use crate::use_cases::constants::document_upload::MAX_FILENAME_CHARS;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{ApplicationRepository, DocumentRepository, StorageProvider};

pub struct RequestUploadUrlInput {
    pub user_id: String,
    pub application_id: String,
    pub filename: String,
    pub mime_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestUploadUrlOutput {
    pub upload_url: String,
    pub storage_key: String,
}

pub struct RequestUploadUrlUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub document_repository: Arc<dyn DocumentRepository>,
    pub storage_provider: Arc<dyn StorageProvider>,
    pub generate_id: GenerateId,
}

/// Each run of whitespace becomes one `-`, everything outside
/// `[a-zA-Z0-9._-]` is dropped, and the result is cut to
/// `MAX_FILENAME_CHARS`.
fn sanitize_filename(name: &str) -> String {
    let mut sanitized = String::new();
    let mut in_whitespace = false;
    for character in name.chars() {
        if is_js_whitespace(character) {
            if !in_whitespace {
                sanitized.push('-');
            }
            in_whitespace = true;
            continue;
        }
        in_whitespace = false;
        if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
            sanitized.push(character);
        }
    }
    // Only ASCII is left, so characters and bytes coincide.
    sanitized.truncate(MAX_FILENAME_CHARS);
    sanitized
}

impl RequestUploadUrlUseCase {
    pub async fn execute(
        &self,
        input: RequestUploadUrlInput,
    ) -> DomainResult<RequestUploadUrlOutput> {
        assert_allowed_mime_type(&input.mime_type)?;

        let application = self
            .application_repository
            .find_by_id(&input.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if application.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        let document_count =
            self.document_repository.count_by_application_id(&input.application_id).await?;
        if document_count >= i64::from(DOCUMENTS_PER_APPLICATION) {
            return Err(DomainError::quota_exceeded(format!(
                "This application already has the maximum of {DOCUMENTS_PER_APPLICATION} documents"
            )));
        }

        let storage_key = format!(
            "users/{}/applications/{}/{}-{}",
            input.user_id,
            input.application_id,
            (self.generate_id)(),
            sanitize_filename(&input.filename)
        );
        let upload_url = self
            .storage_provider
            .get_presigned_upload_url(&storage_key, &input.mime_type, None)
            .await?;

        Ok(RequestUploadUrlOutput { upload_url, storage_key })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_whitespace_runs_and_strips_special_characters() {
        assert_eq!(sanitize_filename("my resume (final).pdf"), "my-resume-final.pdf");
        assert_eq!(sanitize_filename("a \t\n b.pdf"), "a-b.pdf");
        assert_eq!(sanitize_filename("  lead.pdf"), "-lead.pdf");
        assert_eq!(sanitize_filename("r\u{00E9}sum\u{00E9}_v2-final.PDF"), "rsum_v2-final.PDF");
        assert_eq!(sanitize_filename("../../etc/passwd"), "....etcpasswd");
    }

    #[test]
    fn treats_whitespace_as_javascript_does() {
        // A no-break space and a BOM are `\s`; NEL is not, so it is dropped.
        assert_eq!(sanitize_filename("a\u{00A0}b\u{FEFF}c\u{0085}d"), "a-b-cd");
    }

    #[test]
    fn cuts_the_name_to_two_hundred_characters() {
        let long = format!("{}.pdf", "a".repeat(300));
        assert_eq!(sanitize_filename(&long), "a".repeat(200));
    }
}
