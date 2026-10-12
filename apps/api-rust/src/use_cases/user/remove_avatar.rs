use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{StorageProvider, UpdateUserData, UserRepository};

pub struct RemoveAvatarUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub storage_provider: Arc<dyn StorageProvider>,
}

impl RemoveAvatarUseCase {
    pub async fn execute(&self, user_id: &str) -> DomainResult<()> {
        let user = self
            .user_repository
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;

        // Already has no avatar: an idempotent no-op.
        let Some(avatar_key) = user.avatar_key.filter(|key| !key.is_empty()) else {
            return Ok(());
        };

        self.storage_provider.delete(&avatar_key).await?;
        self.user_repository
            .update(user_id, UpdateUserData { avatar_key: Some(None), ..UpdateUserData::default() })
            .await?;
        Ok(())
    }
}
