use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::backup_email_verification_token::BackupEmailVerificationToken;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{
    BackupEmailVerificationTokenRepository, CreateBackupEmailVerificationTokenData,
};

#[derive(Default)]
pub struct FakeBackupEmailVerificationTokenRepository {
    tokens: Mutex<Vec<BackupEmailVerificationToken>>,
}

impl FakeBackupEmailVerificationTokenRepository {
    pub fn with(tokens: Vec<BackupEmailVerificationToken>) -> Self {
        Self { tokens: Mutex::new(tokens) }
    }

    pub fn all(&self) -> Vec<BackupEmailVerificationToken> {
        self.tokens.lock().unwrap().clone()
    }
}

#[async_trait]
impl BackupEmailVerificationTokenRepository for FakeBackupEmailVerificationTokenRepository {
    async fn create(
        &self,
        data: CreateBackupEmailVerificationTokenData,
    ) -> DomainResult<BackupEmailVerificationToken> {
        let mut tokens = self.tokens.lock().unwrap();
        if tokens.iter().any(|token| token.id == data.id || token.token_hash == data.token_hash) {
            return Err(DomainError::internal(
                "duplicate key value violates a \"BackupEmailVerificationToken\" constraint",
            ));
        }
        let token = BackupEmailVerificationToken {
            id: data.id,
            user_id: data.user_id,
            token_hash: data.token_hash,
            new_backup_email: data.new_backup_email,
            expires_at: data.expires_at,
            used_at: None,
            created_at: now(),
        };
        tokens.push(token.clone());
        Ok(token)
    }

    async fn find_by_token_hash(
        &self,
        token_hash: &str,
    ) -> DomainResult<Option<BackupEmailVerificationToken>> {
        Ok(self.all().into_iter().find(|token| token.token_hash == token_hash))
    }

    async fn mark_used(&self, id: &str) -> DomainResult<()> {
        let mut tokens = self.tokens.lock().unwrap();
        if let Some(token) = tokens.iter_mut().find(|token| token.id == id) {
            *token = BackupEmailVerificationToken { used_at: Some(now()), ..token.clone() };
        }
        Ok(())
    }

    async fn delete_all_for_user(&self, user_id: &str) -> DomainResult<()> {
        self.tokens.lock().unwrap().retain(|token| token.user_id != user_id);
        Ok(())
    }
}
