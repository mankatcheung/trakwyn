use std::collections::HashSet;
use std::sync::Arc;

use super::update_application::{UpdateApplicationInput, UpdateApplicationUseCase};
use crate::domain::application::{Application, ApplicationStatus};
use crate::use_cases::constants::board;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::transaction_manager::{in_transaction, TransactionManager};
use crate::use_cases::ports::{ApplicationRepository, FindApplicationsFilters};

pub struct MoveApplicationOnBoardInput {
    pub user_id: String,
    pub application_id: String,
    /// The column the card ends up in; may be the one it started in.
    pub to_status: ApplicationStatus,
    /// The destination column in full, in its new order, including `application_id`.
    pub ordered_ids: Vec<String>,
}

/// Places one card in a kanban column: a drag within a column, or a drag into
/// another column, which is a status change and a placement at once.
///
/// Both halves are one mutation on purpose. Split across two round trips, a
/// cross-column drag would land the card in the right column at whatever depth
/// its old rank happened to point at, then correct itself: visible as a jump.
pub struct MoveApplicationOnBoardUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub update_application_use_case: UpdateApplicationUseCase,
    pub transaction_manager: Arc<dyn TransactionManager>,
}

fn assert_valid_ordered_ids(ordered_ids: &[String], application_id: &str) -> DomainResult<()> {
    if ordered_ids.is_empty() {
        return Err(DomainError::validation("At least one application id is required"));
    }
    if ordered_ids.len() > board::MAX_REORDER_IDS {
        return Err(DomainError::validation(format!(
            "Cannot reorder more than {} applications at once",
            board::MAX_REORDER_IDS
        )));
    }
    if ordered_ids.iter().collect::<HashSet<_>>().len() != ordered_ids.len() {
        return Err(DomainError::validation("Duplicate application ids"));
    }
    if !ordered_ids.iter().any(|id| id == application_id) {
        return Err(DomainError::validation("orderedIds must contain the moved application"));
    }
    Ok(())
}

impl MoveApplicationOnBoardUseCase {
    /// Returns the destination column as it now reads, in order.
    pub async fn execute(
        &self,
        input: MoveApplicationOnBoardInput,
    ) -> DomainResult<Vec<Application>> {
        assert_valid_ordered_ids(&input.ordered_ids, &input.application_id)?;

        let application = self
            .application_repository
            .find_by_id(&input.application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if application.user_id != input.user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        // Every other id must already be a live card of this user's in the
        // destination column. Read outside the transaction.
        let owned = self
            .application_repository
            .find_all_by_user_id(
                &input.user_id,
                FindApplicationsFilters { status: Some(input.to_status) },
            )
            .await?;
        let owned_ids: HashSet<&str> = owned.iter().map(|owned| owned.id.as_str()).collect();

        // Someone else's card, one that does not exist, one in another column
        // and one in the Trash are all the same answer: saying which would
        // confirm the id names something real.
        let foreign = input
            .ordered_ids
            .iter()
            .any(|id| *id != input.application_id && !owned_ids.contains(id.as_str()));
        if foreign {
            return Err(DomainError::forbidden("Forbidden"));
        }

        in_transaction(self.transaction_manager.as_ref(), async {
            // Status first, then the renumber. UpdateApplicationUseCase owns
            // the appliedAt stamp and the status_changed log, and resets
            // boardPosition to 0, which reorder_board immediately overwrites
            // with the real index. A move within one column skips this
            // entirely, so a pure reorder writes no activity log: where a
            // card sits is a view preference, not part of the application's
            // history.
            if application.status != input.to_status {
                self.update_application_use_case
                    .execute(UpdateApplicationInput {
                        user_id: input.user_id.clone(),
                        application_id: input.application_id.clone(),
                        status: Some(input.to_status),
                        ..UpdateApplicationInput::default()
                    })
                    .await?;
            }

            self.application_repository
                .reorder_board(&input.user_id, input.to_status, &input.ordered_ids)
                .await
        })
        .await
    }
}
