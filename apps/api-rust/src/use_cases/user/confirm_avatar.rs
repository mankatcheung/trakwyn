use std::sync::Arc;

use super::avatar_validation::{assert_allowed_avatar_mime_type, assert_valid_avatar_size_bytes};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{StorageProvider, UpdateUserData, UserRepository};

pub struct ConfirmAvatarInput {
    pub user_id: String,
    pub storage_key: String,
    pub mime_type: String,
    pub size_bytes: i32,
}

pub struct ConfirmAvatarUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub storage_provider: Arc<dyn StorageProvider>,
}

impl ConfirmAvatarUseCase {
    pub async fn execute(&self, input: ConfirmAvatarInput) -> DomainResult<()> {
        assert_allowed_avatar_mime_type(&input.mime_type)?;
        assert_valid_avatar_size_bytes(input.size_bytes)?;

        let user = self
            .user_repository
            .find_by_id(&input.user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;

        let previous_key = user.avatar_key;
        self.user_repository
            .update(
                &input.user_id,
                UpdateUserData {
                    avatar_key: Some(Some(input.storage_key.clone())),
                    ..UpdateUserData::default()
                },
            )
            .await?;

        // Clean up the old photo now that the new one is live, so changing
        // an avatar does not leave an orphaned file behind each time.
        if let Some(previous_key) = previous_key.filter(|key| !key.is_empty()) {
            if previous_key != input.storage_key {
                self.storage_provider.delete(&previous_key).await?;
            }
        }
        Ok(())
    }
}
