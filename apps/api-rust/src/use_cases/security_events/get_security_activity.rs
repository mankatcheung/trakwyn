use std::cmp::Reverse;
use std::sync::Arc;

use chrono::{DateTime, Utc};

use crate::domain::security_event::SecurityEventType;
use crate::use_cases::constants::security_activity::LIMIT;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{LoginEventRepository, SecurityEventRepository};

const LOGIN_EVENT_TYPE: &str = "login";

/// What happened: a sign-in, or one of the recorded security events.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecurityActivityEventType {
    Login,
    Event(SecurityEventType),
}

impl SecurityActivityEventType {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Login => LOGIN_EVENT_TYPE,
            Self::Event(event_type) => event_type.as_str(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SecurityActivityItem {
    pub id: String,
    pub event_type: SecurityActivityEventType,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: DateTime<Utc>,
}

pub struct GetSecurityActivityUseCase {
    pub login_event_repository: Arc<dyn LoginEventRepository>,
    pub security_event_repository: Arc<dyn SecurityEventRepository>,
}

impl GetSecurityActivityUseCase {
    pub async fn execute(&self, user_id: &str) -> DomainResult<Vec<SecurityActivityItem>> {
        // Each source is fetched up to the full limit (not half each), so
        // merging and truncating afterwards cannot drop genuinely recent
        // items just because one source happens to dominate.
        let (logins, events) = futures::future::join(
            self.login_event_repository.find_recent_by_user_id(user_id, LIMIT),
            self.security_event_repository.find_recent_by_user_id(user_id, LIMIT),
        )
        .await;

        let logins = logins?.into_iter().map(|event| SecurityActivityItem {
            id: event.id,
            event_type: SecurityActivityEventType::Login,
            ip_address: event.ip_address,
            user_agent: event.user_agent,
            created_at: event.created_at,
        });
        let events = events?.into_iter().map(|event| SecurityActivityItem {
            id: event.id,
            event_type: SecurityActivityEventType::Event(event.event_type),
            ip_address: event.ip_address,
            user_agent: event.user_agent,
            created_at: event.created_at,
        });

        // A stable sort, as JavaScript's is: on a tie, logins stay ahead of
        // security events and each source keeps its own order.
        let mut items: Vec<SecurityActivityItem> = logins.chain(events).collect();
        items.sort_by_key(|item| Reverse(item.created_at));
        items.truncate(LIMIT as usize);
        Ok(items)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::login_event::LoginEvent;
    use crate::domain::security_event::SecurityEvent;
    use crate::use_cases::test_support::{FakeLoginEventRepository, FakeSecurityEventRepository};

    fn at(seconds: i64) -> DateTime<Utc> {
        DateTime::<Utc>::from_timestamp(seconds, 0).unwrap()
    }

    fn login(id: &str, at_s: i64) -> LoginEvent {
        LoginEvent {
            id: id.to_string(),
            user_id: "user-1".to_string(),
            ip_address: Some("203.0.113.7".to_string()),
            user_agent: Some("Firefox".to_string()),
            created_at: at(at_s),
        }
    }

    fn event(id: &str, event_type: SecurityEventType, at_s: i64) -> SecurityEvent {
        SecurityEvent {
            id: id.to_string(),
            user_id: "user-1".to_string(),
            event_type,
            ip_address: None,
            user_agent: Some("Safari".to_string()),
            created_at: at(at_s),
        }
    }

    fn use_case(logins: Vec<LoginEvent>, events: Vec<SecurityEvent>) -> GetSecurityActivityUseCase {
        GetSecurityActivityUseCase {
            login_event_repository: Arc::new(FakeLoginEventRepository::with(logins)),
            security_event_repository: Arc::new(FakeSecurityEventRepository::with(events)),
        }
    }

    #[tokio::test]
    async fn merges_logins_and_security_events_into_one_feed() {
        let items = use_case(
            vec![login("l1", 100)],
            vec![event("s1", SecurityEventType::PasswordChanged, 50)],
        )
        .execute("user-1")
        .await
        .unwrap();

        assert_eq!(items.len(), 2);
        assert_eq!(items[0].id, "l1");
        assert_eq!(items[0].event_type.as_str(), "login");
        assert_eq!(items[0].ip_address.as_deref(), Some("203.0.113.7"));
        assert_eq!(items[1].id, "s1");
        assert_eq!(items[1].event_type.as_str(), "password_changed");
        assert_eq!(items[1].ip_address, None);
        assert_eq!(items[1].user_agent.as_deref(), Some("Safari"));
    }

    #[tokio::test]
    async fn sorts_newest_first_regardless_of_source() {
        let items = use_case(
            vec![login("l-old", 10), login("l-new", 40)],
            vec![
                event("s-mid", SecurityEventType::TotpEnabled, 30),
                event("s-newest", SecurityEventType::SessionRevoked, 50),
            ],
        )
        .execute("user-1")
        .await
        .unwrap();

        let ids: Vec<&str> = items.iter().map(|item| item.id.as_str()).collect();
        assert_eq!(ids, vec!["s-newest", "l-new", "s-mid", "l-old"]);
    }

    #[tokio::test]
    async fn truncates_the_merged_feed_to_the_overall_limit() {
        let logins = (0..20).map(|n| login(&format!("l{n}"), 1_000 + n)).collect();
        let events = (0..20)
            .map(|n| event(&format!("s{n}"), SecurityEventType::EmailChanged, 2_000 + n))
            .collect();

        let items = use_case(logins, events).execute("user-1").await.unwrap();

        assert_eq!(items.len(), 20);
        assert!(items.iter().all(|item| item.id.starts_with('s')));
    }

    #[tokio::test]
    async fn a_login_stays_ahead_of_a_security_event_at_the_same_instant() {
        let items = use_case(
            vec![login("l1", 100)],
            vec![event("s1", SecurityEventType::TotpDisabled, 100)],
        )
        .execute("user-1")
        .await
        .unwrap();

        let ids: Vec<&str> = items.iter().map(|item| item.id.as_str()).collect();
        assert_eq!(ids, vec!["l1", "s1"]);
    }

    #[tokio::test]
    async fn is_empty_when_there_is_no_activity() {
        assert!(use_case(Vec::new(), Vec::new()).execute("user-1").await.unwrap().is_empty());
    }
}
