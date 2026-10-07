use std::cmp::Reverse;
use std::collections::HashMap;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::api_token::ApiToken;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ApiTokenRepository, ApiTokenWithUserEmail, CreateApiTokenData};

#[derive(Default)]
pub struct FakeApiTokenRepository {
    tokens: Mutex<Vec<ApiToken>>,
    /// Stands in for the `User` table `find_by_token_hash` joins: user id to
    /// email. A token whose user is not here is not found by hash, as with
    /// the inner join.
    user_emails: Mutex<HashMap<String, String>>,
}

impl FakeApiTokenRepository {
    pub fn with(tokens: Vec<ApiToken>) -> Self {
        Self { tokens: Mutex::new(tokens), ..Self::default() }
    }

    pub fn with_user(self, user_id: &str, email: &str) -> Self {
        self.user_emails.lock().unwrap().insert(user_id.to_string(), email.to_string());
        self
    }

    pub fn all(&self) -> Vec<ApiToken> {
        self.tokens.lock().unwrap().clone()
    }
}

#[async_trait]
impl ApiTokenRepository for FakeApiTokenRepository {
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<ApiToken>> {
        let mut tokens: Vec<ApiToken> =
            self.all().into_iter().filter(|token| token.user_id == user_id).collect();
        tokens.sort_by_key(|token| Reverse(token.created_at));
        Ok(tokens)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<ApiToken>> {
        Ok(self.all().into_iter().find(|token| token.id == id))
    }

    async fn find_by_token_hash(
        &self,
        token_hash: &str,
    ) -> DomainResult<Option<ApiTokenWithUserEmail>> {
        let Some(token) = self.all().into_iter().find(|token| token.token_hash == token_hash)
        else {
            return Ok(None);
        };
        let user_email = self.user_emails.lock().unwrap().get(&token.user_id).cloned();
        Ok(user_email.map(|user_email| ApiTokenWithUserEmail { token, user_email }))
    }

    async fn create(&self, data: CreateApiTokenData) -> DomainResult<ApiToken> {
        let mut tokens = self.tokens.lock().unwrap();
        if tokens.iter().any(|token| token.id == data.id || token.token_hash == data.token_hash) {
            return Err(DomainError::internal("duplicate ApiToken id or tokenHash"));
        }
        let token = ApiToken {
            id: data.id,
            user_id: data.user_id,
            name: data.name,
            token_hash: data.token_hash,
            scope: data.scope,
            last_used_at: None,
            created_at: now(),
        };
        tokens.push(token.clone());
        Ok(token)
    }

    async fn update_last_used(&self, id: &str) -> DomainResult<()> {
        for token in self.tokens.lock().unwrap().iter_mut().filter(|token| token.id == id) {
            token.last_used_at = Some(now());
        }
        Ok(())
    }

    async fn delete(&self, id: &str) -> DomainResult<()> {
        self.tokens.lock().unwrap().retain(|token| token.id != id);
        Ok(())
    }

    async fn find_by_id_and_user_id(
        &self,
        id: &str,
        user_id: &str,
    ) -> DomainResult<Option<ApiToken>> {
        Ok(self.all().into_iter().find(|token| token.id == id && token.user_id == user_id))
    }
}
