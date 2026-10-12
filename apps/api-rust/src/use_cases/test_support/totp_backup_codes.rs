use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::totp_backup_code::TotpBackupCode;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{CreateTotpBackupCodeData, TotpBackupCodeRepository};

#[derive(Default)]
pub struct FakeTotpBackupCodeRepository {
    codes: Mutex<Vec<TotpBackupCode>>,
}

impl FakeTotpBackupCodeRepository {
    pub fn with(codes: Vec<TotpBackupCode>) -> Self {
        Self { codes: Mutex::new(codes) }
    }

    pub fn all(&self) -> Vec<TotpBackupCode> {
        self.codes.lock().unwrap().clone()
    }
}

#[async_trait]
impl TotpBackupCodeRepository for FakeTotpBackupCodeRepository {
    async fn create(&self, data: CreateTotpBackupCodeData) -> DomainResult<TotpBackupCode> {
        let mut codes = self.codes.lock().unwrap();
        if codes.iter().any(|code| code.id == data.id || code.code_hash == data.code_hash) {
            return Err(DomainError::internal(
                "duplicate key value violates a \"TotpBackupCode\" constraint",
            ));
        }
        let code = TotpBackupCode {
            id: data.id,
            user_id: data.user_id,
            code_hash: data.code_hash,
            used_at: None,
            created_at: now(),
        };
        codes.push(code.clone());
        Ok(code)
    }

    async fn find_by_code_hash(&self, code_hash: &str) -> DomainResult<Option<TotpBackupCode>> {
        Ok(self.all().into_iter().find(|code| code.code_hash == code_hash))
    }

    async fn mark_used(&self, id: &str) -> DomainResult<()> {
        let mut codes = self.codes.lock().unwrap();
        if let Some(code) = codes.iter_mut().find(|code| code.id == id) {
            *code = TotpBackupCode { used_at: Some(now()), ..code.clone() };
        }
        Ok(())
    }

    async fn delete_all_for_user(&self, user_id: &str) -> DomainResult<()> {
        self.codes.lock().unwrap().retain(|code| code.user_id != user_id);
        Ok(())
    }
}
