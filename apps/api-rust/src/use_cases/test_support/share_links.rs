use std::cmp::Reverse;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::share_link::ShareLink;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{CreateShareLinkData, ShareLinkRepository};

#[derive(Default)]
pub struct FakeShareLinkRepository {
    links: Mutex<Vec<ShareLink>>,
}

impl FakeShareLinkRepository {
    pub fn with(links: Vec<ShareLink>) -> Self {
        Self { links: Mutex::new(links) }
    }

    pub fn all(&self) -> Vec<ShareLink> {
        self.links.lock().unwrap().clone()
    }
}

#[async_trait]
impl ShareLinkRepository for FakeShareLinkRepository {
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<ShareLink>> {
        let mut links: Vec<ShareLink> =
            self.all().into_iter().filter(|link| link.user_id == user_id).collect();
        links.sort_by_key(|link| Reverse(link.created_at));
        Ok(links)
    }

    async fn find_by_token_hash(&self, token_hash: &str) -> DomainResult<Option<ShareLink>> {
        Ok(self.all().into_iter().find(|link| link.token_hash == token_hash))
    }

    async fn find_by_id_and_user_id(
        &self,
        id: &str,
        user_id: &str,
    ) -> DomainResult<Option<ShareLink>> {
        Ok(self.all().into_iter().find(|link| link.id == id && link.user_id == user_id))
    }

    async fn create(&self, data: CreateShareLinkData) -> DomainResult<ShareLink> {
        let mut links = self.links.lock().unwrap();
        if links.iter().any(|link| link.id == data.id || link.token_hash == data.token_hash) {
            return Err(DomainError::internal("duplicate ShareLink id or tokenHash"));
        }
        let link = ShareLink {
            id: data.id,
            user_id: data.user_id,
            name: data.name,
            token_hash: data.token_hash,
            last_used_at: None,
            created_at: now(),
        };
        links.push(link.clone());
        Ok(link)
    }

    async fn update_last_used(&self, id: &str) -> DomainResult<()> {
        for link in self.links.lock().unwrap().iter_mut().filter(|link| link.id == id) {
            link.last_used_at = Some(now());
        }
        Ok(())
    }

    async fn delete(&self, id: &str) -> DomainResult<()> {
        self.links.lock().unwrap().retain(|link| link.id != id);
        Ok(())
    }
}
