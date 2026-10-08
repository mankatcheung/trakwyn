use std::sync::Arc;

use async_trait::async_trait;

use crate::domain::security_event::SecurityEvent;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::logger::Logger;
use crate::use_cases::ports::{CreateSecurityEventData, Metrics, SecurityEventRepository};

/// Logs and counts every security event as it is written (JEF-354).
///
/// The `SecurityEvent` table is the audit record; this makes the same events
/// visible to Axiom, where they can be charted and alerted on. A decorator at
/// the repository boundary rather than a line in each use case that writes
/// one, for the same reason as `BlocklistingSessionRepository` and
/// `InstrumentedRateLimiter`: every writer is covered by construction, and a
/// new event type is observable without anyone remembering to make it so.
///
/// The line carries the user id and event type **only**. The IP address and
/// user agent stay in the table, which is deleted with the user on erasure; a
/// log line is not, so copying them here would defeat that.
///
/// The row is written first, and the log follows only if it landed, so a line
/// in Axiom always has a row behind it.
pub struct LoggingSecurityEventRepository {
    inner: Arc<dyn SecurityEventRepository>,
    logger: Arc<dyn Logger>,
    metrics: Arc<dyn Metrics>,
}

impl LoggingSecurityEventRepository {
    pub fn new(
        inner: Arc<dyn SecurityEventRepository>,
        logger: Arc<dyn Logger>,
        metrics: Arc<dyn Metrics>,
    ) -> Self {
        Self { inner, logger, metrics }
    }
}

#[async_trait]
impl SecurityEventRepository for LoggingSecurityEventRepository {
    async fn create(&self, data: CreateSecurityEventData) -> DomainResult<SecurityEvent> {
        let event_type = data.event_type;
        let user_id = data.user_id.clone();
        let event = self.inner.create(data).await?;

        let fields = [
            ("event", format!("security.{}", event_type.as_str()).into()),
            ("eventType", event_type.as_str().into()),
            ("userId", user_id.into()),
        ];
        if event_type.is_suspicious() {
            self.logger.warn("Suspicious security event", None, &fields);
        } else {
            self.logger.info("Security event", &fields);
        }
        self.metrics.record_security_event(event_type.as_str());

        Ok(event)
    }

    async fn find_recent_by_user_id(
        &self,
        user_id: &str,
        limit: i64,
    ) -> DomainResult<Vec<SecurityEvent>> {
        self.inner.find_recent_by_user_id(user_id, limit).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::security_event::SecurityEventType;
    use crate::use_cases::errors::DomainError;
    use crate::use_cases::ports::logger::LogValue;
    use crate::use_cases::test_support::{
        FakeLogger, FakeMetrics, FakeSecurityEventRepository, LogLevel,
    };

    struct Fixture {
        inner: Arc<FakeSecurityEventRepository>,
        logger: Arc<FakeLogger>,
        metrics: Arc<FakeMetrics>,
        repository: LoggingSecurityEventRepository,
    }

    fn fixture() -> Fixture {
        let inner = Arc::new(FakeSecurityEventRepository::default());
        let logger = Arc::new(FakeLogger::default());
        let metrics = Arc::new(FakeMetrics::default());
        let repository =
            LoggingSecurityEventRepository::new(inner.clone(), logger.clone(), metrics.clone());
        Fixture { inner, logger, metrics, repository }
    }

    fn data(event_type: SecurityEventType) -> CreateSecurityEventData {
        CreateSecurityEventData {
            id: "event-1".to_string(),
            user_id: "user-1".to_string(),
            event_type,
            ip_address: Some("203.0.113.7".to_string()),
            user_agent: Some("Firefox".to_string()),
        }
    }

    #[tokio::test]
    async fn create_writes_through_and_returns_the_stored_event() {
        let fixture = fixture();

        let event =
            fixture.repository.create(data(SecurityEventType::PasswordChanged)).await.unwrap();

        assert_eq!(event.id, "event-1");
        assert_eq!(event.ip_address.as_deref(), Some("203.0.113.7"));
        assert_eq!(fixture.inner.all(), vec![event]);
    }

    #[tokio::test]
    async fn an_ordinary_event_is_logged_at_info_with_the_user_and_type_only() {
        let fixture = fixture();

        fixture.repository.create(data(SecurityEventType::SessionRevoked)).await.unwrap();

        let lines = fixture.logger.lines();
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].level, LogLevel::Info);
        assert_eq!(lines[0].message, "Security event");
        // No IP address and no user agent: those stay in the table.
        assert_eq!(
            lines[0].fields,
            vec![
                ("event", LogValue::from("security.session_revoked")),
                ("eventType", LogValue::from("session_revoked")),
                ("userId", LogValue::from("user-1")),
            ]
        );
        assert_eq!(fixture.metrics.security_events(), vec!["session_revoked"]);
    }

    #[tokio::test]
    async fn a_suspicious_event_is_logged_at_warn() {
        let fixture = fixture();

        fixture
            .repository
            .create(data(SecurityEventType::McpOauthRefreshReuseDetected))
            .await
            .unwrap();

        let lines = fixture.logger.lines();
        assert_eq!(lines[0].level, LogLevel::Warn);
        assert_eq!(lines[0].message, "Suspicious security event");
        assert_eq!(
            lines[0].field("event"),
            Some(&LogValue::from("security.mcp_oauth_refresh_reuse_detected"))
        );
        assert_eq!(fixture.metrics.security_events(), vec!["mcp_oauth_refresh_reuse_detected"]);
    }

    struct FailingRepository;

    #[async_trait]
    impl SecurityEventRepository for FailingRepository {
        async fn create(&self, _data: CreateSecurityEventData) -> DomainResult<SecurityEvent> {
            Err(DomainError::internal("connection refused"))
        }

        async fn find_recent_by_user_id(
            &self,
            _user_id: &str,
            _limit: i64,
        ) -> DomainResult<Vec<SecurityEvent>> {
            Ok(Vec::new())
        }
    }

    #[tokio::test]
    async fn a_failed_write_is_neither_logged_nor_counted() {
        let logger = Arc::new(FakeLogger::default());
        let metrics = Arc::new(FakeMetrics::default());
        let repository = LoggingSecurityEventRepository::new(
            Arc::new(FailingRepository),
            logger.clone(),
            metrics.clone(),
        );

        assert!(repository.create(data(SecurityEventType::EmailChanged)).await.is_err());

        assert!(logger.lines().is_empty());
        assert!(metrics.security_events().is_empty());
    }

    #[tokio::test]
    async fn reads_pass_through_without_logging() {
        let fixture = fixture();
        fixture.inner.create(data(SecurityEventType::TotpEnabled)).await.unwrap();

        let events = fixture.repository.find_recent_by_user_id("user-1", 10).await.unwrap();

        assert_eq!(events.len(), 1);
        assert!(fixture.logger.lines().is_empty());
        assert!(fixture.metrics.security_events().is_empty());
    }
}
