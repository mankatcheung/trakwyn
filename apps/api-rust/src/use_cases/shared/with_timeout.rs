use std::future::Future;
use std::time::Duration;

use crate::use_cases::errors::{DomainError, DomainResult};

/// Resolves with `future`, or fails with `on_timeout()` once `ms` has
/// passed, whichever comes first. The future is dropped on timeout, which
/// cancels whatever it was waiting on; work it handed to another thread
/// carries on unobserved.
pub async fn with_timeout<T, F>(
    future: F,
    ms: u64,
    on_timeout: impl FnOnce() -> DomainError,
) -> DomainResult<T>
where
    F: Future<Output = DomainResult<T>>,
{
    match tokio::time::timeout(Duration::from_millis(ms), future).await {
        Ok(result) => result,
        Err(_) => Err(on_timeout()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::errors::ErrorCode;

    #[tokio::test]
    async fn resolves_with_the_future_when_it_settles_in_time() {
        let result = with_timeout(async { Ok("done") }, 1_000, || {
            DomainError::service_unavailable("too slow")
        })
        .await;

        assert_eq!(result.unwrap(), "done");
    }

    #[tokio::test(start_paused = true)]
    async fn fails_with_the_caller_built_error_once_the_deadline_passes() {
        let never = std::future::pending::<DomainResult<()>>();

        let err = with_timeout(never, 50, || DomainError::service_unavailable("too slow"))
            .await
            .unwrap_err();

        assert_eq!(err.code(), ErrorCode::ServiceUnavailable);
        assert_eq!(err.to_string(), "too slow");
    }

    #[tokio::test]
    async fn passes_the_futures_own_failure_through() {
        let failing = async { Err::<(), _>(DomainError::validation("bad")) };

        let err = with_timeout(failing, 1_000, || DomainError::service_unavailable("too slow"))
            .await
            .unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
    }
}
