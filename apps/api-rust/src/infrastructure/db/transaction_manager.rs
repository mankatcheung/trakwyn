use async_trait::async_trait;

use crate::infrastructure::db::Db;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::transaction_manager::{TransactionManager, TransactionWork};

/// Opens the ambient transaction every repository's `Db::conn` joins.
pub struct PgTransactionManager {
    db: Db,
}

impl PgTransactionManager {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

#[async_trait]
impl TransactionManager for PgTransactionManager {
    async fn run<'a>(&self, work: TransactionWork<'a>) -> DomainResult<()> {
        self.db.transaction(|| work).await
    }
}
