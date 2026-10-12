use std::sync::atomic::{AtomicUsize, Ordering};

use async_trait::async_trait;

use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::transaction_manager::{TransactionManager, TransactionWork};

/// Runs the work straight away with nothing to roll back, and counts the
/// runs so a test can assert a use case asked for a transaction at all.
/// Atomicity itself is covered by the Postgres repository tests.
#[derive(Default)]
pub struct FakeTransactionManager {
    runs: AtomicUsize,
}

impl FakeTransactionManager {
    pub fn runs(&self) -> usize {
        self.runs.load(Ordering::SeqCst)
    }
}

#[async_trait]
impl TransactionManager for FakeTransactionManager {
    async fn run<'a>(&self, work: TransactionWork<'a>) -> DomainResult<()> {
        self.runs.fetch_add(1, Ordering::SeqCst);
        work.await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::errors::DomainError;
    use crate::use_cases::ports::transaction_manager::in_transaction;

    #[tokio::test]
    async fn in_transaction_returns_the_works_value() {
        let transactions = FakeTransactionManager::default();

        let value = in_transaction(&transactions, async { Ok(42) }).await.unwrap();

        assert_eq!(value, 42);
        assert_eq!(transactions.runs(), 1);
    }

    #[tokio::test]
    async fn in_transaction_passes_the_works_error_through() {
        let transactions = FakeTransactionManager::default();

        let result: DomainResult<()> =
            in_transaction(&transactions, async { Err(DomainError::conflict("nope")) }).await;

        assert_eq!(result.unwrap_err().to_string(), "nope");
    }
}
