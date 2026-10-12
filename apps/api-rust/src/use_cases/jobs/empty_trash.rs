use std::sync::Arc;

use super::permanently_delete_application::{
    PermanentlyDeleteApplicationInput, PermanentlyDeleteApplicationUseCase,
};
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::logger::Logger;
use crate::use_cases::ports::ApplicationRepository;

pub struct EmptyTrashInput {
    pub user_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EmptyTrashResult {
    pub deleted: usize,
    pub failed: usize,
}

/// Destroys everything in one user's Trash, now, without waiting out the
/// retention window.
///
/// Deliberately the same shape as `PurgeExpiredApplicationsUseCase`: the only
/// differences are which applications it finds and that it answers a request
/// rather than a cron. Both delegate the destroying to
/// `PermanentlyDeleteApplicationUseCase`.
///
/// A failure is counted and logged rather than returned: one bad row should
/// not surface as a generic error over a Trash that is now half empty. The
/// caller gets both numbers and can say what actually happened.
pub struct EmptyTrashUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub permanently_delete_application_use_case: PermanentlyDeleteApplicationUseCase,
    pub logger: Arc<dyn Logger>,
}

impl EmptyTrashUseCase {
    pub async fn execute(&self, input: EmptyTrashInput) -> DomainResult<EmptyTrashResult> {
        let trashed = self.application_repository.find_trashed_by_user_id(&input.user_id).await?;

        let mut result = EmptyTrashResult { deleted: 0, failed: 0 };
        for application in trashed {
            let outcome = self
                .permanently_delete_application_use_case
                .execute(PermanentlyDeleteApplicationInput {
                    user_id: input.user_id.clone(),
                    application_id: application.id.clone(),
                })
                .await;
            match outcome {
                Ok(()) => result.deleted += 1,
                Err(err) => {
                    result.failed += 1;
                    self.logger.error(
                        &format!("Failed to empty application {} from Trash", application.id),
                        Some(&err),
                        &[],
                    );
                }
            }
        }

        Ok(result)
    }
}
