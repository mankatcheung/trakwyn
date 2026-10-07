use std::cmp::Reverse;
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::mcp_oauth::{
    McpOAuthAccessToken, McpOAuthAuthorizationCode, McpOAuthClient, McpOAuthGrant,
    McpOAuthRefreshToken,
};
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{
    CreateMcpOAuthAccessTokenData, CreateMcpOAuthAuthorizationCodeData, CreateMcpOAuthClientData,
    CreateMcpOAuthRefreshTokenData, McpOAuthAuthorizationCodeRepository, McpOAuthClientRepository,
    McpOAuthGrantRepository, McpOAuthRefreshTokenRepository, McpOAuthTokenRepository,
};

#[derive(Default)]
pub struct FakeMcpOAuthClientRepository {
    clients: Mutex<Vec<McpOAuthClient>>,
}

impl FakeMcpOAuthClientRepository {
    pub fn with(clients: Vec<McpOAuthClient>) -> Self {
        Self { clients: Mutex::new(clients) }
    }

    pub fn all(&self) -> Vec<McpOAuthClient> {
        self.clients.lock().unwrap().clone()
    }
}

#[async_trait]
impl McpOAuthClientRepository for FakeMcpOAuthClientRepository {
    async fn create(&self, data: CreateMcpOAuthClientData) -> DomainResult<McpOAuthClient> {
        let mut clients = self.clients.lock().unwrap();
        if clients.iter().any(|client| client.id == data.id) {
            return Err(DomainError::internal("duplicate McpOAuthClient id"));
        }
        let client = McpOAuthClient {
            id: data.id,
            name: data.name,
            redirect_uris: data.redirect_uris,
            revoked_at: None,
            created_at: now(),
        };
        clients.push(client.clone());
        Ok(client)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<McpOAuthClient>> {
        Ok(self.all().into_iter().find(|client| client.id == id))
    }
}

#[derive(Default)]
pub struct FakeMcpOAuthAuthorizationCodeRepository {
    codes: Mutex<Vec<McpOAuthAuthorizationCode>>,
}

impl FakeMcpOAuthAuthorizationCodeRepository {
    pub fn with(codes: Vec<McpOAuthAuthorizationCode>) -> Self {
        Self { codes: Mutex::new(codes) }
    }

    pub fn all(&self) -> Vec<McpOAuthAuthorizationCode> {
        self.codes.lock().unwrap().clone()
    }
}

#[async_trait]
impl McpOAuthAuthorizationCodeRepository for FakeMcpOAuthAuthorizationCodeRepository {
    async fn create(
        &self,
        data: CreateMcpOAuthAuthorizationCodeData,
    ) -> DomainResult<McpOAuthAuthorizationCode> {
        let mut codes = self.codes.lock().unwrap();
        if codes.iter().any(|code| code.id == data.id || code.code_hash == data.code_hash) {
            return Err(DomainError::internal(
                "duplicate McpOAuthAuthorizationCode id or codeHash",
            ));
        }
        let code = McpOAuthAuthorizationCode {
            id: data.id,
            code_hash: data.code_hash,
            family_id: data.family_id,
            client_id: data.client_id,
            user_id: data.user_id,
            redirect_uri: data.redirect_uri,
            scope: data.scope,
            code_challenge: data.code_challenge,
            code_challenge_method: data.code_challenge_method,
            expires_at: data.expires_at,
            consumed_at: None,
            created_at: now(),
        };
        codes.push(code.clone());
        Ok(code)
    }

    async fn find_by_code_hash(
        &self,
        code_hash: &str,
    ) -> DomainResult<Option<McpOAuthAuthorizationCode>> {
        Ok(self.all().into_iter().find(|code| code.code_hash == code_hash))
    }

    async fn consume(&self, id: &str, consumed_at: DateTime<Utc>) -> DomainResult<bool> {
        let mut codes = self.codes.lock().unwrap();
        match codes.iter_mut().find(|code| code.id == id && code.consumed_at.is_none()) {
            Some(code) => {
                code.consumed_at = Some(consumed_at);
                Ok(true)
            }
            None => Ok(false),
        }
    }
}

#[derive(Default)]
pub struct FakeMcpOAuthRefreshTokenRepository {
    tokens: Mutex<Vec<McpOAuthRefreshToken>>,
}

impl FakeMcpOAuthRefreshTokenRepository {
    pub fn with(tokens: Vec<McpOAuthRefreshToken>) -> Self {
        Self { tokens: Mutex::new(tokens) }
    }

    pub fn all(&self) -> Vec<McpOAuthRefreshToken> {
        self.tokens.lock().unwrap().clone()
    }
}

#[async_trait]
impl McpOAuthRefreshTokenRepository for FakeMcpOAuthRefreshTokenRepository {
    async fn create(
        &self,
        data: CreateMcpOAuthRefreshTokenData,
    ) -> DomainResult<McpOAuthRefreshToken> {
        let mut tokens = self.tokens.lock().unwrap();
        if tokens.iter().any(|token| token.id == data.id || token.token_hash == data.token_hash) {
            return Err(DomainError::internal("duplicate McpOAuthRefreshToken id or tokenHash"));
        }
        let token = McpOAuthRefreshToken {
            id: data.id,
            token_hash: data.token_hash,
            family_id: data.family_id,
            client_id: data.client_id,
            user_id: data.user_id,
            scope: data.scope,
            expires_at: data.expires_at,
            used_at: None,
            revoked_at: None,
            created_at: now(),
        };
        tokens.push(token.clone());
        Ok(token)
    }

    async fn find_by_token_hash(
        &self,
        token_hash: &str,
    ) -> DomainResult<Option<McpOAuthRefreshToken>> {
        Ok(self.all().into_iter().find(|token| token.token_hash == token_hash))
    }

    async fn mark_used(&self, id: &str, used_at: DateTime<Utc>) -> DomainResult<bool> {
        let mut tokens = self.tokens.lock().unwrap();
        match tokens.iter_mut().find(|token| token.id == id && token.used_at.is_none()) {
            Some(token) => {
                token.used_at = Some(used_at);
                Ok(true)
            }
            None => Ok(false),
        }
    }

    async fn revoke_family(&self, family_id: &str, revoked_at: DateTime<Utc>) -> DomainResult<()> {
        let mut tokens = self.tokens.lock().unwrap();
        for token in tokens
            .iter_mut()
            .filter(|token| token.family_id == family_id && token.revoked_at.is_none())
        {
            token.revoked_at = Some(revoked_at);
        }
        Ok(())
    }
}

#[derive(Default)]
pub struct FakeMcpOAuthTokenRepository {
    tokens: Mutex<Vec<McpOAuthAccessToken>>,
}

impl FakeMcpOAuthTokenRepository {
    pub fn with(tokens: Vec<McpOAuthAccessToken>) -> Self {
        Self { tokens: Mutex::new(tokens) }
    }

    pub fn all(&self) -> Vec<McpOAuthAccessToken> {
        self.tokens.lock().unwrap().clone()
    }
}

#[async_trait]
impl McpOAuthTokenRepository for FakeMcpOAuthTokenRepository {
    async fn create(
        &self,
        data: CreateMcpOAuthAccessTokenData,
    ) -> DomainResult<McpOAuthAccessToken> {
        let mut tokens = self.tokens.lock().unwrap();
        if tokens.iter().any(|token| token.id == data.id || token.token_hash == data.token_hash) {
            return Err(DomainError::internal("duplicate McpOAuthAccessToken id or tokenHash"));
        }
        let token = McpOAuthAccessToken {
            id: data.id,
            user_id: data.user_id,
            client_id: data.client_id,
            family_id: data.family_id,
            token_hash: data.token_hash,
            scope: data.scope,
            audience: data.audience,
            expires_at: data.expires_at,
            revoked_at: None,
            last_used_at: None,
            created_at: now(),
        };
        tokens.push(token.clone());
        Ok(token)
    }

    async fn find_by_token_hash(
        &self,
        token_hash: &str,
    ) -> DomainResult<Option<McpOAuthAccessToken>> {
        Ok(self.all().into_iter().find(|token| token.token_hash == token_hash))
    }

    async fn update_last_used(&self, id: &str) -> DomainResult<()> {
        for token in self.tokens.lock().unwrap().iter_mut().filter(|token| token.id == id) {
            token.last_used_at = Some(now());
        }
        Ok(())
    }

    async fn revoke(&self, id: &str) -> DomainResult<()> {
        for token in self.tokens.lock().unwrap().iter_mut().filter(|token| token.id == id) {
            token.revoked_at = Some(now());
        }
        Ok(())
    }

    async fn revoke_family(
        &self,
        family_id: &str,
        revoked_at: DateTime<Utc>,
    ) -> DomainResult<Vec<String>> {
        let mut tokens = self.tokens.lock().unwrap();
        let mut hashes = Vec::new();
        for token in tokens
            .iter_mut()
            .filter(|token| token.family_id == family_id && token.revoked_at.is_none())
        {
            token.revoked_at = Some(revoked_at);
            hashes.push(token.token_hash.clone());
        }
        Ok(hashes)
    }
}

/// A grant is not stored: like the SQL repository, this assembles it from the
/// codes, clients and tokens, so it is built over the fakes holding those.
pub struct FakeMcpOAuthGrantRepository {
    pub clients: Arc<FakeMcpOAuthClientRepository>,
    pub codes: Arc<FakeMcpOAuthAuthorizationCodeRepository>,
    pub refresh_tokens: Arc<FakeMcpOAuthRefreshTokenRepository>,
    pub access_tokens: Arc<FakeMcpOAuthTokenRepository>,
}

#[async_trait]
impl McpOAuthGrantRepository for FakeMcpOAuthGrantRepository {
    async fn find_active_by_user_id(
        &self,
        user_id: &str,
        now: DateTime<Utc>,
    ) -> DomainResult<Vec<McpOAuthGrant>> {
        let clients = self.clients.all();
        let refresh_tokens = self.refresh_tokens.all();
        let access_tokens = self.access_tokens.all();

        let mut grants: Vec<McpOAuthGrant> = self
            .codes
            .all()
            .into_iter()
            .filter(|code| code.user_id == user_id)
            .filter(|code| {
                refresh_tokens.iter().any(|token| {
                    token.user_id == user_id
                        && token.family_id == code.family_id
                        && token.revoked_at.is_none()
                        && token.expires_at > now
                })
            })
            .filter_map(|code| {
                // The inner join: a code whose client is gone describes no grant.
                let client = clients.iter().find(|client| client.id == code.client_id)?;
                let last_used_at = access_tokens
                    .iter()
                    .filter(|token| token.user_id == user_id && token.family_id == code.family_id)
                    .filter_map(|token| token.last_used_at)
                    .max();
                Some(McpOAuthGrant {
                    id: code.family_id,
                    user_id: user_id.to_string(),
                    client_id: code.client_id,
                    client_name: client.name.clone(),
                    scope: code.scope,
                    authorized_at: code.created_at,
                    last_used_at,
                })
            })
            .collect();
        grants.sort_by_key(|grant| Reverse(grant.authorized_at));
        Ok(grants)
    }
}
