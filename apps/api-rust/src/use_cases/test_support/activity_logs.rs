use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::activity_log::ActivityLog;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{ActivityLogRepository, AppendActivityLogData};

#[derive(Default)]
pub struct FakeActivityLogRepository {
    entries: Mutex<Vec<ActivityLog>>,
}

impl FakeActivityLogRepository {
    pub fn entries(&self) -> Vec<ActivityLog> {
        self.entries.lock().unwrap().clone()
    }
}

#[async_trait]
impl ActivityLogRepository for FakeActivityLogRepository {
    async fn find_all_by_application_id(
        &self,
        application_id: &str,
    ) -> DomainResult<Vec<ActivityLog>> {
        Ok(self
            .entries()
            .into_iter()
            .filter(|entry| entry.application_id == application_id)
            .collect())
    }

    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<ActivityLog>> {
        Ok(self.entries().into_iter().filter(|entry| entry.actor_id == user_id).collect())
    }

    async fn append(&self, data: AppendActivityLogData) -> DomainResult<ActivityLog> {
        let entry = ActivityLog {
            id: data.id,
            application_id: data.application_id,
            actor_id: data.actor_id,
            event_type: data.event_type,
            payload: data.payload,
            created_at: now(),
        };
        self.entries.lock().unwrap().push(entry.clone());
        Ok(entry)
    }
}
