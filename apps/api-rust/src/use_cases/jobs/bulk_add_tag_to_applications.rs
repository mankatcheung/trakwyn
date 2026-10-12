use std::sync::Arc;

use super::bulk_validation::assert_valid_bulk_ids;
use super::update_application::{UpdateApplicationInput, UpdateApplicationUseCase};
use crate::domain::application::Application;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::transaction_manager::{in_transaction, TransactionManager};
use crate::use_cases::ports::ApplicationRepository;

pub struct BulkAddTagToApplicationsInput {
    pub user_id: String,
    pub application_ids: Vec<String>,
    pub tag: String,
}

/// Adds one tag to a selection, leaving an application that already carries
/// it with the tags it had. The batch is one transaction.
pub struct BulkAddTagToApplicationsUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub update_application_use_case: UpdateApplicationUseCase,
    pub transaction_manager: Arc<dyn TransactionManager>,
}

impl BulkAddTagToApplicationsUseCase {
    pub async fn execute(
        &self,
        input: BulkAddTagToApplicationsInput,
    ) -> DomainResult<Vec<Application>> {
        assert_valid_bulk_ids(&input.application_ids)?;

        in_transaction(self.transaction_manager.as_ref(), async {
            let mut updated = Vec::with_capacity(input.application_ids.len());
            for application_id in &input.application_ids {
                let application = self
                    .application_repository
                    .find_by_id(application_id)
                    .await?
                    .ok_or_else(|| DomainError::not_found("Application not found"))?;
                if application.user_id != input.user_id {
                    return Err(DomainError::forbidden("Forbidden"));
                }

                let mut tags = application.tags;
                if !tags.contains(&input.tag) {
                    tags.push(input.tag.clone());
                }
                let application = self
                    .update_application_use_case
                    .execute(UpdateApplicationInput {
                        user_id: input.user_id.clone(),
                        application_id: application_id.clone(),
                        tags: Some(tags),
                        ..UpdateApplicationInput::default()
                    })
                    .await?;
                updated.push(application);
            }
            Ok(updated)
        })
        .await
    }
}
