//! Postgres access.
//!
//! Repositories never hold a connection. Each method asks [`Db::conn`] for
//! one, which is the ambient transaction's connection when the call is inside
//! [`Db::transaction`] and a pooled one otherwise. That is the same contract
//! as `apps/api`'s `transactionContext.ts`: a use case opens a transaction and
//! every repository it calls joins it without being told.

pub mod migrations;
pub mod repositories;
pub mod transaction_manager;

use std::future::Future;
use std::ops::{Deref, DerefMut};
use std::sync::Arc;
use std::time::Duration;

use sqlx::pool::PoolConnection;
use sqlx::postgres::{PgConnection, PgPoolOptions};
use sqlx::{PgPool, Postgres, Transaction};
use tokio::sync::{Mutex, OwnedMutexGuard};

use crate::use_cases::errors::{DomainError, DomainResult};

/// Pool policy, sized for Neon's Free plan behind its transaction-mode
/// pooler: few connections, given back quickly, released before Neon's own
/// idle timeout closes them.
mod pool {
    use std::time::Duration;

    pub const MAX_CONNECTIONS: u32 = 10;
    pub const ACQUIRE_TIMEOUT: Duration = Duration::from_secs(10);
    pub const IDLE_TIMEOUT: Duration = Duration::from_secs(30);
}

type SharedTransaction = Arc<Mutex<Option<Transaction<'static, Postgres>>>>;

tokio::task_local! {
    static AMBIENT_TRANSACTION: SharedTransaction;
}

impl From<sqlx::Error> for DomainError {
    fn from(err: sqlx::Error) -> Self {
        DomainError::internal(err)
    }
}

#[derive(Clone)]
pub struct Db {
    pool: PgPool,
}

impl Db {
    pub async fn connect(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = PgPoolOptions::new()
            .max_connections(pool::MAX_CONNECTIONS)
            .acquire_timeout(pool::ACQUIRE_TIMEOUT)
            .idle_timeout(Some(pool::IDLE_TIMEOUT))
            .connect(database_url)
            .await?;
        Ok(Self { pool })
    }

    pub fn from_pool(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// A connection for one statement or a short run of them.
    ///
    /// Drop it before awaiting another repository call: inside a transaction
    /// every caller shares one connection, and holding it across such a call
    /// would wait on itself.
    pub async fn conn(&self) -> DomainResult<Conn> {
        match AMBIENT_TRANSACTION.try_with(Arc::clone) {
            Ok(shared) => Ok(Conn::Transaction(shared.lock_owned().await)),
            Err(_) => Ok(Conn::Pooled(self.pool.acquire().await?)),
        }
    }

    /// Runs `work` in one transaction: committed if it returns `Ok`, rolled
    /// back if it returns `Err`. A call made while a transaction is already
    /// open joins it rather than nesting.
    pub async fn transaction<T, F, Fut>(&self, work: F) -> DomainResult<T>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = DomainResult<T>>,
    {
        if AMBIENT_TRANSACTION.try_with(|_| ()).is_ok() {
            return work().await;
        }

        let shared: SharedTransaction = Arc::new(Mutex::new(Some(self.pool.begin().await?)));
        let result = AMBIENT_TRANSACTION.scope(Arc::clone(&shared), work()).await;

        let Some(transaction) = shared.lock().await.take() else {
            return Err(DomainError::internal("transaction was already finished"));
        };
        match result {
            Ok(value) => {
                transaction.commit().await?;
                Ok(value)
            }
            Err(err) => {
                // The original error is what the caller needs; a failed
                // rollback only means the connection is discarded.
                let _ = transaction.rollback().await;
                Err(err)
            }
        }
    }

    pub async fn close(&self, timeout: Duration) {
        let _ = tokio::time::timeout(timeout, self.pool.close()).await;
    }
}

/// A connection borrowed from [`Db::conn`]; derefs to `PgConnection`, so
/// `&mut *conn` is what a query executes on.
pub enum Conn {
    Pooled(PoolConnection<Postgres>),
    Transaction(OwnedMutexGuard<Option<Transaction<'static, Postgres>>>),
}

const FINISHED: &str = "the ambient transaction is only taken after its scope has ended";

impl Deref for Conn {
    type Target = PgConnection;

    fn deref(&self) -> &PgConnection {
        match self {
            Self::Pooled(conn) => conn,
            Self::Transaction(guard) => guard.as_ref().expect(FINISHED),
        }
    }
}

impl DerefMut for Conn {
    fn deref_mut(&mut self) -> &mut PgConnection {
        match self {
            Self::Pooled(conn) => conn,
            Self::Transaction(guard) => guard.as_mut().expect(FINISHED),
        }
    }
}
