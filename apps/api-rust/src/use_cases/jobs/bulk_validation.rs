use crate::use_cases::constants::bulk_actions;
use crate::use_cases::errors::{DomainError, DomainResult};

/// Shared guard for bulk-write use cases: rejects empty or oversized id batches.
pub fn assert_valid_bulk_ids(ids: &[String]) -> DomainResult<()> {
    if ids.is_empty() {
        return Err(DomainError::validation("At least one application id is required"));
    }
    if ids.len() > bulk_actions::MAX_IDS {
        return Err(DomainError::validation(format!(
            "Cannot act on more than {} applications at once",
            bulk_actions::MAX_IDS
        )));
    }
    Ok(())
}
