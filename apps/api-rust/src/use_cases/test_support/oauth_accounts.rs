use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::oauth_account::{OAuthAccount, OAuthProviderName};
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{CreateOAuthAccountData, OAuthAccountRepository};

#[derive(Default)]
pub struct FakeOAuthAccountRepository {
    accounts: Mutex<Vec<OAuthAccount>>,
}

impl FakeOAuthAccountRepository {
    pub fn with(accounts: Vec<OAuthAccount>) -> Self {
        Self { accounts: Mutex::new(accounts) }
    }

    pub fn all(&self) -> Vec<OAuthAccount> {
        self.accounts.lock().unwrap().clone()
    }
}

#[async_trait]
impl OAuthAccountRepository for FakeOAuthAccountRepository {
    async fn find_by_provider(
        &self,
        provider: OAuthProviderName,
        provider_account_id: &str,
    ) -> DomainResult<Option<OAuthAccount>> {
        Ok(self.all().into_iter().find(|account| {
            account.provider == provider && account.provider_account_id == provider_account_id
        }))
    }

    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<OAuthAccount>> {
        Ok(self.all().into_iter().filter(|account| account.user_id == user_id).collect())
    }

    async fn create(&self, data: CreateOAuthAccountData) -> DomainResult<OAuthAccount> {
        let mut accounts = self.accounts.lock().unwrap();
        let taken = accounts.iter().any(|account| {
            account.id == data.id
                || (account.provider == data.provider
                    && account.provider_account_id == data.provider_account_id)
        });
        if taken {
            return Err(DomainError::internal(
                "duplicate key value violates an \"OAuthAccount\" constraint",
            ));
        }
        let account = OAuthAccount {
            id: data.id,
            user_id: data.user_id,
            provider: data.provider,
            provider_account_id: data.provider_account_id,
            email: data.email,
            created_at: now(),
        };
        accounts.push(account.clone());
        Ok(account)
    }

    async fn delete(&self, id: &str) -> DomainResult<()> {
        self.accounts.lock().unwrap().retain(|account| account.id != id);
        Ok(())
    }
}
