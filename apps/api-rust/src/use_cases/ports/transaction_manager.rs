use std::future::Future;
use std::pin::Pin;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::use_cases::errors::{DomainError, DomainResult};

/// A unit of work handed to a [`TransactionManager`].
pub type TransactionWork<'a> = Pin<Box<dyn Future<Output = DomainResult<()>> + Send + 'a>>;

/// Runs work so that every repository call inside it commits or rolls back
/// together. A run started inside another joins it rather than nesting.
///
/// The trait takes a boxed, unit-returning future so it stays object-safe;
/// use [`in_transaction`] to run work that returns a value.
#[async_trait]
pub trait TransactionManager: Send + Sync {
    async fn run<'a>(&self, work: TransactionWork<'a>) -> DomainResult<()>;
}

/// Runs `work` in a transaction and returns what it returned: committed on
/// `Ok`, rolled back on `Err`.
pub async fn in_transaction<T, Fut>(
    transactions: &dyn TransactionManager,
    work: Fut,
) -> DomainResult<T>
where
    T: Send,
    Fut: Future<Output = DomainResult<T>> + Send,
{
    let output = Mutex::new(None);
    transactions
        .run(Box::pin(async {
            let value = work.await?;
            *output.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(value);
            Ok(())
        }))
        .await?;

    output
        .into_inner()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .ok_or_else(|| DomainError::internal("transaction finished without running its work"))
}
