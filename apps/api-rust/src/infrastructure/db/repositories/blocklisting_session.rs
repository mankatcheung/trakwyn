use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use futures::future::join_all;

use crate::domain::session::Session;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{
    CreateSessionData, RotateRefreshTokenData, SessionBlocklist, SessionRepository,
};

/// Decorates the session repository so that **every** database revocation
/// also blocklists the affected session ids (JEF-164).
///
/// Doing it here rather than at each call site is what makes it complete:
/// there are four distinct revocation paths, and each gains immediate
/// revocation for free:
///   - `RevokeSessionUseCase` (logout, and revoking one listed device)
///   - `RevokeOtherSessionsUseCase` ("sign out other sessions")
///   - `ResetPasswordUseCase` (revokes every session after a reset)
///   - `RotateRefreshTokenUseCase` (refresh-token reuse detected)
///
/// A future fifth caller cannot forget the blocklist write, since it can only
/// reach the database through this decorator.
///
/// The database write stays the source of truth and always happens first; the
/// blocklist is a best-effort accelerator on top (its implementations fail
/// open and never fail), so a blocklist outage degrades to "revocation
/// applies at the next refresh" rather than failing the revocation itself.
pub struct BlocklistingSessionRepository {
    inner: Arc<dyn SessionRepository>,
    blocklist: Arc<dyn SessionBlocklist>,
}

impl BlocklistingSessionRepository {
    pub fn new(inner: Arc<dyn SessionRepository>, blocklist: Arc<dyn SessionBlocklist>) -> Self {
        Self { inner, blocklist }
    }

    async fn blocklist_all<'a>(&self, session_ids: impl Iterator<Item = &'a str>) {
        join_all(session_ids.map(|id| self.blocklist.revoke(id))).await;
    }
}

#[async_trait]
impl SessionRepository for BlocklistingSessionRepository {
    async fn revoke(&self, id: &str) -> DomainResult<()> {
        self.inner.revoke(id).await?;
        self.blocklist.revoke(id).await;
        Ok(())
    }

    async fn revoke_all_for_user_except(&self, user_id: &str, except_id: &str) -> DomainResult<()> {
        // The ids are read first: once the database revocation lands these
        // are no longer "active", so there would be nothing left to enumerate.
        let affected = self.inner.find_active_by_user_id(user_id).await?;
        self.inner.revoke_all_for_user_except(user_id, except_id).await?;
        self.blocklist_all(
            affected.iter().map(|session| session.id.as_str()).filter(|id| *id != except_id),
        )
        .await;
        Ok(())
    }

    async fn revoke_all_for_user(&self, user_id: &str) -> DomainResult<()> {
        let affected = self.inner.find_active_by_user_id(user_id).await?;
        self.inner.revoke_all_for_user(user_id).await?;
        self.blocklist_all(affected.iter().map(|session| session.id.as_str())).await;
        Ok(())
    }

    // ── Pass-through: nothing below revokes a session ──

    async fn create(&self, data: CreateSessionData) -> DomainResult<Session> {
        self.inner.create(data).await
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Session>> {
        self.inner.find_by_id(id).await
    }

    async fn find_by_id_and_user_id(
        &self,
        id: &str,
        user_id: &str,
    ) -> DomainResult<Option<Session>> {
        self.inner.find_by_id_and_user_id(id, user_id).await
    }

    async fn find_active_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Session>> {
        self.inner.find_active_by_user_id(user_id).await
    }

    async fn touch(&self, id: &str, expires_at: DateTime<Utc>) -> DomainResult<()> {
        self.inner.touch(id, expires_at).await
    }

    async fn rotate_refresh_token(
        &self,
        id: &str,
        data: RotateRefreshTokenData,
    ) -> DomainResult<()> {
        self.inner.rotate_refresh_token(id, data).await
    }

    async fn find_distinct_user_agents_by_user_id(
        &self,
        user_id: &str,
    ) -> DomainResult<Vec<String>> {
        self.inner.find_distinct_user_agents_by_user_id(user_id).await
    }
}

#[cfg(test)]
mod tests {
    use chrono::TimeDelta;

    use super::*;
    use crate::use_cases::clock::now;
    use crate::use_cases::test_support::{
        session_for, FakeSessionBlocklist, FakeSessionRepository,
    };

    struct Fixture {
        inner: Arc<FakeSessionRepository>,
        blocklist: Arc<FakeSessionBlocklist>,
        repository: BlocklistingSessionRepository,
    }

    fn fixture(sessions: Vec<Session>) -> Fixture {
        let inner = Arc::new(FakeSessionRepository::with(sessions));
        let blocklist = Arc::new(FakeSessionBlocklist::default());
        let repository = BlocklistingSessionRepository::new(inner.clone(), blocklist.clone());
        Fixture { inner, blocklist, repository }
    }

    impl Fixture {
        async fn blocklisted(&self, ids: &[&str]) -> Vec<bool> {
            let mut answers = Vec::new();
            for id in ids {
                answers.push(self.blocklist.is_revoked(id).await);
            }
            answers
        }

        fn revoked_in_db(&self) -> Vec<String> {
            self.inner
                .all()
                .into_iter()
                .filter(|session| session.revoked_at.is_some())
                .map(|session| session.id)
                .collect()
        }
    }

    #[tokio::test]
    async fn revoke_writes_the_database_and_blocklists_the_session() {
        let fixture = fixture(vec![session_for("s1", "u1"), session_for("s2", "u1")]);

        fixture.repository.revoke("s1").await.unwrap();

        assert_eq!(fixture.revoked_in_db(), vec!["s1"]);
        assert_eq!(fixture.blocklisted(&["s1", "s2"]).await, vec![true, false]);
    }

    #[tokio::test]
    async fn revoking_the_others_blocklists_each_but_spares_the_current_one() {
        let fixture = fixture(vec![
            session_for("current", "u1"),
            session_for("other-1", "u1"),
            session_for("other-2", "u1"),
            session_for("foreign", "u2"),
        ]);

        fixture.repository.revoke_all_for_user_except("u1", "current").await.unwrap();

        assert_eq!(fixture.revoked_in_db(), vec!["other-1", "other-2"]);
        // Had the ids been read after the revocation, none would still have
        // been active and nothing would have been blocklisted.
        assert_eq!(
            fixture.blocklisted(&["current", "other-1", "other-2", "foreign"]).await,
            vec![false, true, true, false]
        );
    }

    #[tokio::test]
    async fn revoking_everything_blocklists_every_active_session_of_the_user() {
        let fixture = fixture(vec![
            session_for("s1", "u1"),
            session_for("s2", "u1"),
            Session { expires_at: now() - TimeDelta::hours(1), ..session_for("expired", "u1") },
            session_for("foreign", "u2"),
        ]);

        fixture.repository.revoke_all_for_user("u1").await.unwrap();

        assert_eq!(fixture.revoked_in_db(), vec!["s1", "s2", "expired"]);
        // An expired session has no live access token left to refuse.
        assert_eq!(
            fixture.blocklisted(&["s1", "s2", "expired", "foreign"]).await,
            vec![true, true, false, false]
        );
    }

    #[tokio::test]
    async fn everything_else_passes_through_without_touching_the_blocklist() {
        let fixture = fixture(vec![Session {
            user_agent: Some("Firefox".to_string()),
            ..session_for("s1", "u1")
        }]);
        let repository = &fixture.repository;
        let expires_at = now() + TimeDelta::days(1);

        let created = repository
            .create(CreateSessionData {
                id: "s2".to_string(),
                user_id: "u1".to_string(),
                user_agent: None,
                ip_address: None,
                device_label: None,
                location: None,
                expires_at,
                current_refresh_token_id: "jti".to_string(),
            })
            .await
            .unwrap();
        assert_eq!(created.id, "s2");
        assert_eq!(repository.find_by_id("s1").await.unwrap().unwrap().id, "s1");
        assert!(repository.find_by_id_and_user_id("s1", "u2").await.unwrap().is_none());
        assert_eq!(repository.find_active_by_user_id("u1").await.unwrap().len(), 2);
        assert_eq!(
            repository.find_distinct_user_agents_by_user_id("u1").await.unwrap(),
            vec!["Firefox"]
        );

        repository.touch("s1", expires_at).await.unwrap();
        repository
            .rotate_refresh_token(
                "s1",
                RotateRefreshTokenData {
                    current_refresh_token_id: "next".to_string(),
                    previous_refresh_token_id: "refresh-s1".to_string(),
                    previous_rotated_at: now(),
                    expires_at,
                },
            )
            .await
            .unwrap();

        let stored = fixture.inner.find_by_id("s1").await.unwrap().unwrap();
        assert_eq!(stored.expires_at, expires_at);
        assert_eq!(stored.current_refresh_token_id.as_deref(), Some("next"));
        assert_eq!(fixture.blocklisted(&["s1", "s2"]).await, vec![false, false]);
    }
}
