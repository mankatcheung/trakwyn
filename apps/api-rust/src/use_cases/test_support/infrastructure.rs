use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use async_trait::async_trait;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{
    AccessClaims, RefreshClaims, SessionBlocklist, TokenPair, TokenService,
};

/// Ids `"{prefix}-1"`, `"{prefix}-2"`, … in call order.
pub fn sequential_ids(prefix: &'static str) -> GenerateId {
    let counter = AtomicUsize::new(0);
    Arc::new(move || format!("{prefix}-{}", counter.fetch_add(1, Ordering::SeqCst) + 1))
}

#[derive(Default)]
pub struct FakeSessionBlocklist {
    revoked: Mutex<HashSet<String>>,
}

#[async_trait]
impl SessionBlocklist for FakeSessionBlocklist {
    async fn revoke(&self, session_id: &str) {
        self.revoked.lock().unwrap().insert(session_id.to_string());
    }

    async fn is_revoked(&self, session_id: &str) -> bool {
        self.revoked.lock().unwrap().contains(session_id)
    }
}

/// Verifies only the tokens it was told about; signs a recognisable pair.
#[derive(Default)]
pub struct FakeTokenService {
    access: HashMap<String, AccessClaims>,
    refresh: HashMap<String, RefreshClaims>,
}

impl FakeTokenService {
    pub fn with_access(mut self, token: &str, claims: AccessClaims) -> Self {
        self.access.insert(token.to_string(), claims);
        self
    }

    pub fn with_refresh(mut self, token: &str, claims: RefreshClaims) -> Self {
        self.refresh.insert(token.to_string(), claims);
        self
    }
}

impl TokenService for FakeTokenService {
    fn sign(
        &self,
        user_id: &str,
        _email: &str,
        session_id: &str,
        refresh_token_id: &str,
        _auth_time_ms: i64,
    ) -> DomainResult<TokenPair> {
        Ok(TokenPair {
            access_token: format!("access:{user_id}:{session_id}"),
            refresh_token: format!("refresh:{user_id}:{session_id}:{refresh_token_id}"),
        })
    }

    fn verify_access(&self, token: &str) -> Option<AccessClaims> {
        self.access.get(token).cloned()
    }

    fn verify_refresh(&self, token: &str) -> DomainResult<RefreshClaims> {
        self.refresh
            .get(token)
            .cloned()
            .ok_or_else(|| DomainError::unauthorized("Invalid refresh token"))
    }
}
