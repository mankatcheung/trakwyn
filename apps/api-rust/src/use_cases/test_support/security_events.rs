use std::cmp::Reverse;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::security_event::SecurityEvent;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateSecurityEventData, SecurityEventRepository};

#[derive(Default)]
pub struct FakeSecurityEventRepository {
    events: Mutex<Vec<SecurityEvent>>,
}

impl FakeSecurityEventRepository {
    pub fn with(events: Vec<SecurityEvent>) -> Self {
        Self { events: Mutex::new(events) }
    }

    pub fn all(&self) -> Vec<SecurityEvent> {
        self.events.lock().unwrap().clone()
    }
}

#[async_trait]
impl SecurityEventRepository for FakeSecurityEventRepository {
    async fn create(&self, data: CreateSecurityEventData) -> DomainResult<SecurityEvent> {
        let event = SecurityEvent {
            id: data.id,
            user_id: data.user_id,
            event_type: data.event_type,
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
    ) -> DomainResult<Vec<SecurityEvent>> {
        let mut events: Vec<SecurityEvent> =
            self.all().into_iter().filter(|event| event.user_id == user_id).collect();
        events.sort_by_key(|event| Reverse(event.created_at));
        events.truncate(limit.max(0) as usize);
        Ok(events)
    }
}
