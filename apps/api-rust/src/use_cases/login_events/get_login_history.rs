use std::sync::Arc;

use crate::domain::login_event::LoginEvent;
use crate::use_cases::constants::login_history::LIMIT;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::LoginEventRepository;

pub struct GetLoginHistoryUseCase {
    pub login_event_repository: Arc<dyn LoginEventRepository>,
}

impl GetLoginHistoryUseCase {
    pub async fn execute(&self, user_id: &str) -> DomainResult<Vec<LoginEvent>> {
        self.login_event_repository.find_recent_by_user_id(user_id, LIMIT).await
    }
}

#[cfg(test)]
mod tests {
    use chrono::{DateTime, Utc};

    use super::*;
    use crate::use_cases::test_support::FakeLoginEventRepository;

    fn event(id: &str, user_id: &str, at_s: i64) -> LoginEvent {
        LoginEvent {
            id: id.to_string(),
            user_id: user_id.to_string(),
            ip_address: Some("203.0.113.7".to_string()),
            user_agent: Some("Firefox".to_string()),
            created_at: DateTime::<Utc>::from_timestamp(at_s, 0).unwrap(),
        }
    }

    fn use_case(events: Vec<LoginEvent>) -> GetLoginHistoryUseCase {
        GetLoginHistoryUseCase {
            login_event_repository: Arc::new(FakeLoginEventRepository::with(events)),
        }
    }

    #[tokio::test]
    async fn returns_the_users_recent_logins_newest_first() {
        let history = use_case(vec![
            event("old", "user-1", 100),
            event("new", "user-1", 200),
            event("foreign", "user-2", 300),
        ])
        .execute("user-1")
        .await
        .unwrap();

        let ids: Vec<&str> = history.iter().map(|event| event.id.as_str()).collect();
        assert_eq!(ids, vec!["new", "old"]);
    }

    #[tokio::test]
    async fn caps_the_history_at_the_limit() {
        let events = (0..25).map(|n| event(&format!("e{n}"), "user-1", n)).collect();

        let history = use_case(events).execute("user-1").await.unwrap();

        assert_eq!(history.len(), 20);
        assert_eq!(history[0].id, "e24");
    }

    #[tokio::test]
    async fn is_empty_for_a_user_with_no_logins() {
        assert!(use_case(Vec::new()).execute("user-1").await.unwrap().is_empty());
    }
}
