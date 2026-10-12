use chrono::{DateTime, Utc};

use crate::use_cases::errors::{DomainError, DomainResult};

/// A date a resolver built from client text.
///
/// `apps/api` builds these with `new Date(text)`, which never fails: text it
/// cannot read gives an Invalid Date, and that only fails when the driver
/// serialises it for the query. So a use case carries the bad date past its
/// own checks (a missing row is still "not found") and fails with an internal
/// error at the point it would have been stored.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClientDate {
    Valid(DateTime<Utc>),
    Invalid,
}

impl ClientDate {
    /// The instant to store, or the internal error storing an Invalid Date is.
    pub fn stored(self) -> DomainResult<DateTime<Utc>> {
        match self {
            Self::Valid(instant) => Ok(instant),
            Self::Invalid => Err(DomainError::internal("Invalid time value")),
        }
    }
}

impl From<DateTime<Utc>> for ClientDate {
    fn from(instant: DateTime<Utc>) -> Self {
        Self::Valid(instant)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::errors::ErrorCode;

    #[test]
    fn a_valid_date_is_stored_as_is() {
        let instant = DateTime::<Utc>::UNIX_EPOCH;
        assert_eq!(ClientDate::Valid(instant).stored().unwrap(), instant);
    }

    #[test]
    fn an_invalid_date_is_an_internal_error() {
        let err = ClientDate::Invalid.stored().unwrap_err();
        assert_eq!(err.code(), ErrorCode::InternalError);
    }
}
