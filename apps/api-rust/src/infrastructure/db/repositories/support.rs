//! Helpers shared by the repositories.

use crate::use_cases::errors::DomainError;

/// A stored value that no entity variant matches: the row was written by
/// something that knows a value this build does not.
pub fn unknown_value(table: &str, column: &str, value: &str) -> DomainError {
    DomainError::internal(format!(r#"unrecognised "{table}"."{column}" value {value:?}"#))
}
