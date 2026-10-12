use std::sync::Arc;

use super::avatar_validation::assert_allowed_avatar_mime_type;
use super::js_string::is_js_whitespace;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::StorageProvider;

const MAX_FILENAME_LENGTH: usize = 200;

pub struct RequestAvatarUploadUrlInput {
    pub user_id: String,
    pub filename: String,
    pub mime_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestAvatarUploadUrlOutput {
    pub upload_url: String,
    pub storage_key: String,
}

/// Each run of whitespace becomes one hyphen, anything outside
/// `[a-zA-Z0-9._-]` is dropped, and the result is cut to 200 characters.
fn sanitize_filename(name: &str) -> String {
    let mut sanitized = String::new();
    let mut in_whitespace = false;
    for c in name.chars() {
        if is_js_whitespace(c) {
            if !in_whitespace {
                sanitized.push('-');
            }
            in_whitespace = true;
            continue;
        }
        in_whitespace = false;
        if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
            sanitized.push(c);
        }
    }
    // Everything left is ASCII, so bytes are characters.
    sanitized.truncate(MAX_FILENAME_LENGTH);
    sanitized
}

pub struct RequestAvatarUploadUrlUseCase {
    pub storage_provider: Arc<dyn StorageProvider>,
    pub generate_id: GenerateId,
}

impl RequestAvatarUploadUrlUseCase {
    pub async fn execute(
        &self,
        input: RequestAvatarUploadUrlInput,
    ) -> DomainResult<RequestAvatarUploadUrlOutput> {
        assert_allowed_avatar_mime_type(&input.mime_type)?;

        let storage_key = format!(
            "users/{}/avatar/{}-{}",
            input.user_id,
            (self.generate_id)(),
            sanitize_filename(&input.filename)
        );
        let upload_url = self
            .storage_provider
            .get_presigned_upload_url(&storage_key, &input.mime_type, None)
            .await?;

        Ok(RequestAvatarUploadUrlOutput { upload_url, storage_key })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_whitespace_runs_and_strips_everything_unsafe() {
        assert_eq!(sanitize_filename("my  profile\tpic (1)!.png"), "my-profile-pic-1.png");
        assert_eq!(sanitize_filename("../../etc/passwd"), "....etcpasswd");
        assert_eq!(sanitize_filename("фото é.png"), "-.png");
        assert_eq!(sanitize_filename("a\u{00A0}\u{3000}b"), "a-b");
    }

    #[test]
    fn cuts_the_name_to_200_characters() {
        assert_eq!(sanitize_filename(&"a".repeat(250)).len(), 200);
    }
}
