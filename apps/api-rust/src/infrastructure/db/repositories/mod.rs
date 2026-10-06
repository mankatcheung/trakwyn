//! sqlx implementations of the repository ports.
//!
//! Tables and columns keep the quoted camelCase names Drizzle created, so
//! every identifier in a query here is double-quoted. Timestamps are bound
//! from `use_cases::clock::now()` rather than SQL `now()`, which would carry
//! microseconds the `timestamptz(3)` columns round away.

mod activity_log;
mod application;
mod note;

pub use activity_log::PgActivityLogRepository;
pub use application::PgApplicationRepository;
pub use note::PgNoteRepository;

use crate::use_cases::errors::DomainError;

/// A stored value that no entity variant matches: the row was written by
/// something that knows a value this build does not.
fn unknown_value(table: &str, column: &str, value: &str) -> DomainError {
    DomainError::internal(format!(r#"unrecognised "{table}"."{column}" value {value:?}"#))
}
