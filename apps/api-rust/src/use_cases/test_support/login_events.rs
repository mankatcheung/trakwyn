use std::cmp::Reverse;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::login_event::LoginEvent;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateLoginEventData, LoginEventRepository};

#[derive(Default)]
pub struct FakeLoginEventRepository {
    events: Mutex<Vec<LoginEvent>>,
}

impl FakeLoginEventRepository {
    pub fn with(events: Vec<LoginEvent>) -> Self {
        Self { events: Mutex::new(events) }
    }

    pub fn all(&self) -> Vec<LoginEvent> {
        self.events.lock().unwrap().clone()
    }
}

#[async_trait]
impl LoginEventRepository for FakeLoginEventRepository {
    async fn create(&self, data: CreateLoginEventData) -> DomainResult<LoginEvent> {
        let event = LoginEvent {
            id: data.id,
            user_id: data.user_id,
            ip_address: data.ip_address,
            user_agent: data.user_agent,
            created_at: now(),
        };
        self.events.lock().unwrap().push(event.clone());
        Ok(event)
    }

    async fn find_recent_by_user_id(
        &self,
        user_id: &str,
        limit: i64,
    ) -> DomainResult<Vec<LoginEvent>> {
        let mut events: Vec<LoginEvent> =
            self.all().into_iter().filter(|event| event.user_id == user_id).collect();
        events.sort_by_key(|event| Reverse(event.created_at));
        events.truncate(limit.max(0) as usize);
        Ok(events)
    }
}
