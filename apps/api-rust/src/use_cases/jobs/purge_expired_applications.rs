use std::sync::Arc;

use chrono::TimeDelta;

use super::permanently_delete_application::{
    PermanentlyDeleteApplicationInput, PermanentlyDeleteApplicationUseCase,
};
use crate::use_cases::clock::now;
use crate::use_cases::constants::trash;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::logger::Logger;
use crate::use_cases::ports::ApplicationRepository;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PurgeExpiredApplicationsResult {
    pub purged: usize,
    pub failed: usize,
}

/// Finishes what deleting started, for anything that has served its thirty
/// days.
///
/// Each application is deleted on its own and a failure is logged rather than
/// returned: one unreachable blob should not strand every later application
/// in Trash for another day, and the next run will pick it up again. The
/// count of failures comes back so the route can report it instead of
/// claiming success.
pub struct PurgeExpiredApplicationsUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub permanently_delete_application_use_case: PermanentlyDeleteApplicationUseCase,
    pub logger: Arc<dyn Logger>,
}

impl PurgeExpiredApplicationsUseCase {
    pub async fn execute(&self) -> DomainResult<PurgeExpiredApplicationsResult> {
        let cutoff = now() - TimeDelta::milliseconds(trash::RETENTION_MS);
        let expired = self.application_repository.find_due_for_purge(cutoff).await?;

        let mut result = PurgeExpiredApplicationsResult { purged: 0, failed: 0 };
        for application in expired {
            // The owner's own id, so this goes through the same ownership
            // check as a user pressing "Delete permanently" rather than
            // around it.
            let outcome = self
                .permanently_delete_application_use_case
                .execute(PermanentlyDeleteApplicationInput {
                    user_id: application.user_id.clone(),
                    application_id: application.id.clone(),
                })
                .await;
            match outcome {
                Ok(()) => result.purged += 1,
                Err(err) => {
                    result.failed += 1;
                    self.logger.error(
                        &format!("Failed to purge application {}", application.id),
                        Some(&err),
                        &[],
                    );
                }
            }
        }

        Ok(result)
    }
}
