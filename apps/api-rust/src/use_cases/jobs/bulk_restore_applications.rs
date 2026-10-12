use super::bulk_validation::assert_valid_bulk_ids;
use super::restore_application::{RestoreApplicationInput, RestoreApplicationUseCase};
use crate::use_cases::errors::{DomainResult, ErrorCode};

pub struct BulkRestoreApplicationsInput {
    pub user_id: String,
    pub application_ids: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BulkRestoreApplicationsResult {
    /// How many applications actually moved out of Trash. Lower than the
    /// batch size when some of the ids were already restored: reporting the
    /// batch size would claim work that did not happen.
    pub restored: usize,
}

/// Restores a selection from Trash in one call, mirroring
/// `BulkDeleteApplicationsUseCase`: same validation, same treatment of an id
/// that is already in the target state.
pub struct BulkRestoreApplicationsUseCase {
    pub restore_application_use_case: RestoreApplicationUseCase,
}

impl BulkRestoreApplicationsUseCase {
    pub async fn execute(
        &self,
        input: BulkRestoreApplicationsInput,
    ) -> DomainResult<BulkRestoreApplicationsResult> {
        assert_valid_bulk_ids(&input.application_ids)?;

        let mut restored = 0;
        let mut real_failure = None;
        for application_id in input.application_ids {
            let result = self
                .restore_application_use_case
                .execute(RestoreApplicationInput { user_id: input.user_id.clone(), application_id })
                .await;
            match result {
                Ok(()) => restored += 1,
                // An id that is no longer in Trash is already where the
                // caller wanted it: an idempotent no-op rather than a failure.
                Err(err) if err.code() == ErrorCode::NotFound => {}
                // Anything else, FORBIDDEN above all, still fails the call: a
                // silently skipped id belonging to someone else would be a
                // security bug wearing a convenience feature's clothes.
                Err(err) => {
                    real_failure.get_or_insert(err);
                }
            }
        }

        match real_failure {
            Some(err) => Err(err),
            None => Ok(BulkRestoreApplicationsResult { restored }),
        }
    }
}
