use std::sync::Arc;

use super::password_hashing::verify_password;
use crate::use_cases::auth::{assert_has_password, is_session_fresh, SessionAuthTime};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{DocumentRepository, StorageProvider, UserRepository};

pub struct DeleteAccountInput {
    pub user_id: String,
    pub password: String,
    pub auth_time: SessionAuthTime,
}

pub struct DeleteAccountUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub document_repository: Arc<dyn DocumentRepository>,
    pub storage_provider: Arc<dyn StorageProvider>,
}

impl DeleteAccountUseCase {
    pub async fn execute(&self, input: DeleteAccountInput) -> DomainResult<()> {
        let user = self
            .user_repository
            .find_by_id(&input.user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;
        let password_hash = assert_has_password(user.password_hash.as_deref())?;

        if !verify_password(&input.password, password_hash).await? {
            return Err(DomainError::unauthorized("Invalid password"));
        }

        if user.totp_enabled && !is_session_fresh(input.auth_time) {
            return Err(DomainError::step_up_required(
                "Please verify your identity again to continue.",
            ));
        }

        // Blobs before rows: once the user row cascades away, the documents'
        // storage keys go with it, and nothing would ever notice the orphaned
        // files left behind. A storage failure stops here, with the account
        // intact; a key that is already gone is not a failure.
        let documents = self.document_repository.find_all_by_user_id(&input.user_id).await?;
        let keys: Vec<String> = documents.into_iter().map(|doc| doc.storage_key).collect();
        self.storage_provider.delete_many(&keys).await?;

        // Everything else the user owns goes with the row, by `ON DELETE CASCADE`.
        self.user_repository.delete(&input.user_id).await
    }
}
