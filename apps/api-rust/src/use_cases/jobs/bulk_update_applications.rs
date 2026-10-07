use std::sync::Arc;

use super::bulk_validation::assert_valid_bulk_ids;
use super::update_application::{UpdateApplicationInput, UpdateApplicationUseCase};
use crate::domain::application::{Application, ApplicationStatus};
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::transaction_manager::{in_transaction, TransactionManager};

pub struct BulkUpdateApplicationsInput {
    pub user_id: String,
    pub application_ids: Vec<String>,
    pub status: Option<ApplicationStatus>,
    pub starred: Option<bool>,
}

/// Applies one status and/or starred change to a selection. The batch is one
/// transaction: a failure on any id leaves every application as it was.
pub struct BulkUpdateApplicationsUseCase {
    pub update_application_use_case: UpdateApplicationUseCase,
    pub transaction_manager: Arc<dyn TransactionManager>,
}

impl BulkUpdateApplicationsUseCase {
    pub async fn execute(
        &self,
        input: BulkUpdateApplicationsInput,
    ) -> DomainResult<Vec<Application>> {
        assert_valid_bulk_ids(&input.application_ids)?;

        in_transaction(self.transaction_manager.as_ref(), async {
            let mut updated = Vec::with_capacity(input.application_ids.len());
            for application_id in &input.application_ids {
                let application = self
                    .update_application_use_case
                    .execute(UpdateApplicationInput {
                        user_id: input.user_id.clone(),
                        application_id: application_id.clone(),
                        status: input.status,
                        starred: input.starred,
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
