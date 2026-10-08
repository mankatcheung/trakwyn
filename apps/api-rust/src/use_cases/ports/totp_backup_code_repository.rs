use async_trait::async_trait;

use crate::domain::totp_backup_code::TotpBackupCode;
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateTotpBackupCodeData {
    pub id: String,
    pub user_id: String,
    pub code_hash: String,
}

#[async_trait]
pub trait TotpBackupCodeRepository: Send + Sync {
    async fn create(&self, data: CreateTotpBackupCodeData) -> DomainResult<TotpBackupCode>;
    async fn find_by_code_hash(&self, code_hash: &str) -> DomainResult<Option<TotpBackupCode>>;
    async fn mark_used(&self, id: &str) -> DomainResult<()>;
    async fn delete_all_for_user(&self, user_id: &str) -> DomainResult<()>;
}
