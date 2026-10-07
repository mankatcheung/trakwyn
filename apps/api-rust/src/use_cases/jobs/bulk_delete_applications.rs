use super::bulk_validation::assert_valid_bulk_ids;
use super::delete_application::{DeleteApplicationInput, DeleteApplicationUseCase};
use crate::use_cases::errors::{DomainResult, ErrorCode};

pub struct BulkDeleteApplicationsInput {
    pub user_id: String,
    pub application_ids: Vec<String>,
}

/// Moves a selection to Trash. Every id is attempted; the batch is not a
/// transaction.
pub struct BulkDeleteApplicationsUseCase {
    pub delete_application_use_case: DeleteApplicationUseCase,
}

impl BulkDeleteApplicationsUseCase {
    pub async fn execute(&self, input: BulkDeleteApplicationsInput) -> DomainResult<()> {
        assert_valid_bulk_ids(&input.application_ids)?;

        let mut real_failure = None;
        for application_id in input.application_ids {
            let result = self
                .delete_application_use_case
                .execute(DeleteApplicationInput { user_id: input.user_id.clone(), application_id })
                .await;
            // A NOT_FOUND item is already gone (e.g. a retried bulk-delete
            // after a partial success): an idempotent no-op, not a failure.
            if let Err(err) = result {
                if err.code() != ErrorCode::NotFound && real_failure.is_none() {
                    real_failure = Some(err);
                }
            }
        }

        real_failure.map_or(Ok(()), Err)
    }
}
