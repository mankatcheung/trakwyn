use std::cmp::Reverse;
use std::sync::Mutex;

use async_trait::async_trait;
use chrono::{DateTime, TimeDelta, Utc};

use crate::domain::session::Session;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{CreateSessionData, RotateRefreshTokenData, SessionRepository};

/// A live session for `user_id`: used just now, expiring in a week.
pub fn session_for(id: &str, user_id: &str) -> Session {
    let timestamp = now();
    Session {
        id: id.to_string(),
        user_id: user_id.to_string(),
        user_agent: None,
        ip_address: None,
        device_label: None,
        location: None,
        last_used_at: timestamp,
        created_at: timestamp,
        expires_at: timestamp + TimeDelta::days(7),
        revoked_at: None,
        current_refresh_token_id: Some(format!("refresh-{id}")),
        previous_refresh_token_id: None,
        previous_rotated_at: None,
    }
}

#[derive(Default)]
pub struct FakeSessionRepository {
    sessions: Mutex<Vec<Session>>,
}

impl FakeSessionRepository {
    pub fn with(sessions: Vec<Session>) -> Self {
        Self { sessions: Mutex::new(sessions) }
    }

    pub fn all(&self) -> Vec<Session> {
        self.sessions.lock().unwrap().clone()
    }

    /// Rewrites every session `matches` selects; none matching is not an error.
    fn rewrite(&self, matches: impl Fn(&Session) -> bool, change: impl Fn(Session) -> Session) {
        let mut sessions = self.sessions.lock().unwrap();
        for session in sessions.iter_mut().filter(|session| matches(session)) {
            *session = change(session.clone());
        }
    }
}

#[async_trait]
impl SessionRepository for FakeSessionRepository {
    async fn create(&self, data: CreateSessionData) -> DomainResult<Session> {
        let mut sessions = self.sessions.lock().unwrap();
        if sessions.iter().any(|session| session.id == data.id) {
            return Err(DomainError::internal("duplicate key value violates \"Session_pkey\""));
        }
        let timestamp = now();
        let session = Session {
            id: data.id,
            user_id: data.user_id,
            user_agent: data.user_agent,
            ip_address: data.ip_address,
            device_label: data.device_label,
            location: data.location,
            last_used_at: timestamp,
            created_at: timestamp,
            expires_at: data.expires_at,
            revoked_at: None,
            current_refresh_token_id: Some(data.current_refresh_token_id),
            previous_refresh_token_id: None,
            previous_rotated_at: None,
        };
        sessions.push(session.clone());
        Ok(session)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Session>> {
        Ok(self.all().into_iter().find(|session| session.id == id))
    }

    async fn find_by_id_and_user_id(
        &self,
        id: &str,
        user_id: &str,
    ) -> DomainResult<Option<Session>> {
        Ok(self.all().into_iter().find(|session| session.id == id && session.user_id == user_id))
    }

    async fn find_active_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Session>> {
        let timestamp = now();
        let mut sessions: Vec<Session> = self
            .all()
            .into_iter()
            .filter(|session| {
                session.user_id == user_id
                    && session.revoked_at.is_none()
                    && session.expires_at > timestamp
            })
            .collect();
        sessions.sort_by_key(|session| Reverse(session.last_used_at));
        Ok(sessions)
    }

    async fn touch(&self, id: &str, expires_at: DateTime<Utc>) -> DomainResult<()> {
        self.rewrite(
            |session| session.id == id,
            |session| Session { last_used_at: now(), expires_at, ..session },
        );
        Ok(())
    }

    async fn rotate_refresh_token(
        &self,
        id: &str,
        data: RotateRefreshTokenData,
    ) -> DomainResult<()> {
        self.rewrite(
            |session| session.id == id,
            |session| Session {
                last_used_at: now(),
                expires_at: data.expires_at,
                current_refresh_token_id: Some(data.current_refresh_token_id.clone()),
                previous_refresh_token_id: Some(data.previous_refresh_token_id.clone()),
                previous_rotated_at: Some(data.previous_rotated_at),
                ..session
            },
        );
        Ok(())
    }

    /// Like the SQL, this restamps a session that was already revoked.
    async fn revoke(&self, id: &str) -> DomainResult<()> {
        self.rewrite(
            |session| session.id == id,
            |session| Session { revoked_at: Some(now()), ..session },
        );
        Ok(())
    }

    async fn revoke_all_for_user_except(&self, user_id: &str, except_id: &str) -> DomainResult<()> {
        self.rewrite(
            |session| {
                session.user_id == user_id
                    && session.id != except_id
                    && session.revoked_at.is_none()
            },
            |session| Session { revoked_at: Some(now()), ..session },
        );
        Ok(())
    }

    async fn revoke_all_for_user(&self, user_id: &str) -> DomainResult<()> {
        self.rewrite(
            |session| session.user_id == user_id && session.revoked_at.is_none(),
            |session| Session { revoked_at: Some(now()), ..session },
        );
        Ok(())
    }

    async fn find_distinct_user_agents_by_user_id(
        &self,
        user_id: &str,
    ) -> DomainResult<Vec<String>> {
        let mut user_agents: Vec<String> = Vec::new();
        for session in self.all().into_iter().filter(|session| session.user_id == user_id) {
            if let Some(user_agent) = session.user_agent {
                if !user_agents.contains(&user_agent) {
                    user_agents.push(user_agent);
                }
            }
        }
        Ok(user_agents)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn with_agent(id: &str, user_id: &str, user_agent: Option<&str>) -> Session {
        Session { user_agent: user_agent.map(str::to_string), ..session_for(id, user_id) }
    }

    #[tokio::test]
    async fn active_sessions_exclude_revoked_expired_and_foreign_ones() {
        let stale = now() - TimeDelta::hours(1);
        let sessions = FakeSessionRepository::with(vec![
            Session { last_used_at: stale, ..session_for("older", "u1") },
            session_for("newer", "u1"),
            Session { revoked_at: Some(now()), ..session_for("revoked", "u1") },
            Session { expires_at: stale, ..session_for("expired", "u1") },
            session_for("foreign", "u2"),
        ]);

        let active = sessions.find_active_by_user_id("u1").await.unwrap();

        let ids: Vec<&str> = active.iter().map(|session| session.id.as_str()).collect();
        assert_eq!(ids, vec!["newer", "older"]);
    }

    #[tokio::test]
    async fn revoking_all_but_one_spares_it_and_other_users() {
        let sessions = FakeSessionRepository::with(vec![
            session_for("keep", "u1"),
            session_for("drop", "u1"),
            session_for("foreign", "u2"),
        ]);

        sessions.revoke_all_for_user_except("u1", "keep").await.unwrap();

        let revoked: Vec<String> = sessions
            .all()
            .into_iter()
            .filter(|session| session.revoked_at.is_some())
            .map(|session| session.id)
            .collect();
        assert_eq!(revoked, vec!["drop"]);
    }

    #[tokio::test]
    async fn rotation_records_both_token_ids() {
        let sessions = FakeSessionRepository::with(vec![session_for("s1", "u1")]);
        let rotated_at = now();

        sessions
            .rotate_refresh_token(
                "s1",
                RotateRefreshTokenData {
                    current_refresh_token_id: "next".to_string(),
                    previous_refresh_token_id: "refresh-s1".to_string(),
                    previous_rotated_at: rotated_at,
                    expires_at: rotated_at + TimeDelta::days(30),
                },
            )
            .await
            .unwrap();

        let session = sessions.find_by_id_and_user_id("s1", "u1").await.unwrap().unwrap();
        assert_eq!(session.current_refresh_token_id.as_deref(), Some("next"));
        assert_eq!(session.previous_refresh_token_id.as_deref(), Some("refresh-s1"));
        assert_eq!(session.previous_rotated_at, Some(rotated_at));
        assert_eq!(session.expires_at, rotated_at + TimeDelta::days(30));
    }

    #[tokio::test]
    async fn distinct_user_agents_skip_nulls_duplicates_and_other_users() {
        let sessions = FakeSessionRepository::with(vec![
            with_agent("a", "u1", Some("Firefox")),
            with_agent("b", "u1", Some("Firefox")),
            with_agent("c", "u1", None),
            with_agent("d", "u1", Some("Safari")),
            with_agent("e", "u2", Some("Chrome")),
        ]);

        let user_agents = sessions.find_distinct_user_agents_by_user_id("u1").await.unwrap();

        assert_eq!(user_agents, vec!["Firefox", "Safari"]);
    }
}
