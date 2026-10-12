use std::sync::Arc;

use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{UpdateUserData, UserRepository};

pub struct DismissOnboardingChecklistUseCase {
    pub user_repository: Arc<dyn UserRepository>,
}

impl DismissOnboardingChecklistUseCase {
    pub async fn execute(&self, user_id: &str) -> DomainResult<()> {
        self.user_repository
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;

        self.user_repository
            .update(
                user_id,
                UpdateUserData {
                    onboarding_checklist_dismissed_at: Some(Some(now())),
                    ..UpdateUserData::default()
                },
            )
            .await?;
        Ok(())
    }
}
