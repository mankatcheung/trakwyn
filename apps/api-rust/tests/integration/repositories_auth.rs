//! Tests for the auth and user repositories against a real Postgres with the
//! real migrations.

use std::time::Duration;

use chrono::{DateTime, TimeDelta, Utc};

use trakwyn_api::domain::oauth_account::OAuthProviderName;
use trakwyn_api::domain::security_event::SecurityEventType;
use trakwyn_api::domain::user::DigestFrequency;
use trakwyn_api::infrastructure::db::repositories::{
    PgBackupEmailVerificationTokenRepository, PgEmailVerificationTokenRepository,
    PgLoginEventRepository, PgOAuthAccountRepository, PgPasswordResetTokenRepository,
    PgSecurityEventRepository, PgSessionRepository, PgTotpBackupCodeRepository, PgUserRepository,
};
use trakwyn_api::infrastructure::db::Db;
use trakwyn_api::use_cases::clock::now;
use trakwyn_api::use_cases::errors::DomainError;
use trakwyn_api::use_cases::ports::{
    BackupEmailVerificationTokenRepository, CreateBackupEmailVerificationTokenData,
    CreateEmailVerificationTokenData, CreateLoginEventData, CreateOAuthAccountData,
    CreatePasswordResetTokenData, CreateSecurityEventData, CreateSessionData,
    CreateTotpBackupCodeData, CreateUserData, EmailVerificationTokenRepository,
    LoginEventRepository, OAuthAccountRepository, PasswordResetTokenRepository,
    RotateRefreshTokenData, SecurityEventRepository, SessionRepository, TotpBackupCodeRepository,
    UpdateUserData, UserRepository,
};

use crate::common::{seed_user, TestDb};

/// A database holding `user-1` and `user-2`.
async fn seeded() -> Db {
    let TestDb { db } = TestDb::create().await;
    seed_user(&db, "user-1").await;
    seed_user(&db, "user-2").await;
    db
}

/// Long enough for two `now()` calls to land on different milliseconds.
async fn tick() {
    tokio::time::sleep(Duration::from_millis(5)).await;
}

fn in_a_week() -> DateTime<Utc> {
    now() + TimeDelta::days(7)
}

async fn delete_user(db: &Db, id: &str) {
    sqlx::query(r#"DELETE FROM "User" WHERE "id" = $1"#).bind(id).execute(db.pool()).await.unwrap();
}

mod users {
    use super::*;

    fn user_data(id: &str, email: &str) -> CreateUserData {
        CreateUserData {
            id: id.to_string(),
            email: email.to_string(),
            password_hash: Some("hashed".to_string()),
            ..Default::default()
        }
    }

    async fn repository_with_ada() -> PgUserRepository {
        let TestDb { db } = TestDb::create().await;
        let users = PgUserRepository::new(db);
        users.create(user_data("u1", "ada@example.com")).await.unwrap();
        users
    }

    #[tokio::test]
    async fn creates_a_user_with_the_column_defaults() {
        let TestDb { db } = TestDb::create().await;
        let users = PgUserRepository::new(db);

        let created = users.create(user_data("u1", "ada@example.com")).await.unwrap();

        assert_eq!(created.id, "u1");
        assert_eq!(created.email, "ada@example.com");
        assert_eq!(created.password_hash.as_deref(), Some("hashed"));
        assert_eq!(created.created_at, created.updated_at);
        assert!(created.weekly_digest_enabled);
        assert_eq!(created.digest_frequency, DigestFrequency::Weekly);
        assert!(created.follow_up_reminders_enabled);
        assert!(!created.push_notifications_enabled);
        assert_eq!(created.weekly_application_goal, 5);
        assert!(!created.totp_enabled);
        assert!(!created.use_cross_application_context);
        assert!(!created.llm_fallback_when_limited);
        // What was returned is what is stored: no sub-millisecond drift.
        assert_eq!(users.find_by_id("u1").await.unwrap(), Some(created));
    }

    #[tokio::test]
    async fn every_nullable_column_starts_null() {
        let created = repository_with_ada().await.find_by_id("u1").await.unwrap().unwrap();

        assert_eq!(created.name, None);
        assert_eq!(created.timezone, None);
        assert_eq!(created.target_role, None);
        assert_eq!(created.email_verified_at, None);
        assert_eq!(created.avatar_key, None);
        assert_eq!(created.last_digest_sent_at, None);
        assert_eq!(created.totp_secret, None);
        assert_eq!(created.default_llm_provider, None);
        assert_eq!(created.custom_ai_prompt, None);
        assert_eq!(created.backup_email, None);
        assert_eq!(created.backup_email_verified_at, None);
        assert_eq!(created.onboarding_checklist_dismissed_at, None);
    }

    #[tokio::test]
    async fn creates_a_passwordless_pre_verified_user_for_oauth_sign_up() {
        let TestDb { db } = TestDb::create().await;
        let users = PgUserRepository::new(db);
        let verified_at = now();

        let created = users
            .create(CreateUserData {
                id: "u1".to_string(),
                email: "oauth@example.com".to_string(),
                password_hash: None,
                name: Some("Ada".to_string()),
                email_verified_at: Some(verified_at),
            })
            .await
            .unwrap();

        assert_eq!(created.password_hash, None);
        assert_eq!(created.name.as_deref(), Some("Ada"));
        assert_eq!(created.email_verified_at, Some(verified_at));
    }

    #[tokio::test]
    async fn a_second_user_with_the_same_email_is_refused() {
        let users = repository_with_ada().await;

        let err = users.create(user_data("u2", "ada@example.com")).await;

        assert!(matches!(err, Err(DomainError::Internal(_))));
        assert_eq!(users.find_all().await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn finds_by_id_and_by_email_case_sensitively() {
        let users = repository_with_ada().await;

        assert_eq!(users.find_by_id("missing").await.unwrap(), None);
        assert_eq!(users.find_by_email("ada@example.com").await.unwrap().unwrap().id, "u1");
        assert_eq!(users.find_by_email("nobody@example.com").await.unwrap(), None);
        assert_eq!(users.find_by_email("ADA@EXAMPLE.COM").await.unwrap(), None);
    }

    #[tokio::test]
    async fn finds_by_backup_email() {
        let users = repository_with_ada().await;
        users
            .update(
                "u1",
                UpdateUserData {
                    backup_email: Some(Some("spare@example.com".to_string())),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(
            users.find_by_backup_email("spare@example.com").await.unwrap().unwrap().id,
            "u1"
        );
        // The primary address is not a backup address.
        assert_eq!(users.find_by_backup_email("ada@example.com").await.unwrap(), None);
    }

    #[tokio::test]
    async fn lists_every_user_oldest_first() {
        let users = repository_with_ada().await;
        tick().await;
        users.create(user_data("u2", "grace@example.com")).await.unwrap();
        tick().await;
        users.create(user_data("u0", "alan@example.com")).await.unwrap();

        let listed = users.find_all().await.unwrap();

        let ids: Vec<&str> = listed.iter().map(|user| user.id.as_str()).collect();
        assert_eq!(ids, vec!["u1", "u2", "u0"]);
    }

    #[tokio::test]
    async fn an_update_writes_only_the_named_fields_and_moves_updated_at() {
        let users = repository_with_ada().await;
        let created = users.find_by_id("u1").await.unwrap().unwrap();
        tick().await;

        let updated = users
            .update(
                "u1",
                UpdateUserData { email: Some("new@example.com".to_string()), ..Default::default() },
            )
            .await
            .unwrap();

        assert_eq!(updated.email, "new@example.com");
        assert_eq!(updated.password_hash.as_deref(), Some("hashed"));
        assert_eq!(updated.created_at, created.created_at);
        assert!(updated.updated_at > created.updated_at);
        assert_eq!(users.find_by_id("u1").await.unwrap(), Some(updated));
    }

    #[tokio::test]
    async fn an_update_naming_no_field_still_moves_updated_at() {
        let users = repository_with_ada().await;
        let created = users.find_by_id("u1").await.unwrap().unwrap();
        tick().await;

        let updated = users.update("u1", UpdateUserData::default()).await.unwrap();

        assert!(updated.updated_at > created.updated_at);
        assert_eq!(
            updated,
            trakwyn_api::domain::user::User { updated_at: updated.updated_at, ..created }
        );
    }

    #[tokio::test]
    async fn an_update_writes_every_field_it_names() {
        let users = repository_with_ada().await;
        let timestamp = now();
        let text = |value: &str| Some(Some(value.to_string()));

        let updated = users
            .update(
                "u1",
                UpdateUserData {
                    email: Some("new@example.com".to_string()),
                    password_hash: Some("rehashed".to_string()),
                    name: text("Ada"),
                    timezone: text("Europe/London"),
                    target_role: text("Engineer"),
                    email_verified_at: Some(Some(timestamp)),
                    avatar_key: text("avatars/u1.png"),
                    weekly_digest_enabled: Some(false),
                    digest_frequency: Some(DigestFrequency::Daily),
                    follow_up_reminders_enabled: Some(false),
                    push_notifications_enabled: Some(true),
                    weekly_application_goal: Some(12),
                    totp_secret: text("JBSWY3DP"),
                    totp_enabled: Some(true),
                    default_llm_provider: text("anthropic"),
                    custom_ai_prompt: text("Be brief."),
                    use_cross_application_context: Some(true),
                    llm_fallback_when_limited: Some(true),
                    backup_email: text("spare@example.com"),
                    backup_email_verified_at: Some(Some(timestamp)),
                    onboarding_checklist_dismissed_at: Some(Some(timestamp)),
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.email, "new@example.com");
        assert_eq!(updated.password_hash.as_deref(), Some("rehashed"));
        assert_eq!(updated.name.as_deref(), Some("Ada"));
        assert_eq!(updated.timezone.as_deref(), Some("Europe/London"));
        assert_eq!(updated.target_role.as_deref(), Some("Engineer"));
        assert_eq!(updated.email_verified_at, Some(timestamp));
        assert_eq!(updated.avatar_key.as_deref(), Some("avatars/u1.png"));
        assert!(!updated.weekly_digest_enabled);
        assert_eq!(updated.digest_frequency, DigestFrequency::Daily);
        assert!(!updated.follow_up_reminders_enabled);
        assert!(updated.push_notifications_enabled);
        assert_eq!(updated.weekly_application_goal, 12);
        assert_eq!(updated.totp_secret.as_deref(), Some("JBSWY3DP"));
        assert!(updated.totp_enabled);
        assert_eq!(updated.default_llm_provider.as_deref(), Some("anthropic"));
        assert_eq!(updated.custom_ai_prompt.as_deref(), Some("Be brief."));
        assert!(updated.use_cross_application_context);
        assert!(updated.llm_fallback_when_limited);
        assert_eq!(updated.backup_email.as_deref(), Some("spare@example.com"));
        assert_eq!(updated.backup_email_verified_at, Some(timestamp));
        assert_eq!(updated.onboarding_checklist_dismissed_at, Some(timestamp));
        assert_eq!(users.find_by_id("u1").await.unwrap(), Some(updated));
    }

    #[tokio::test]
    async fn an_update_can_set_a_nullable_field_back_to_null() {
        let users = repository_with_ada().await;
        let timestamp = now();
        users
            .update(
                "u1",
                UpdateUserData {
                    name: Some(Some("Ada".to_string())),
                    timezone: Some(Some("Europe/London".to_string())),
                    email_verified_at: Some(Some(timestamp)),
                    totp_secret: Some(Some("JBSWY3DP".to_string())),
                    avatar_key: Some(Some("avatars/u1.png".to_string())),
                    default_llm_provider: Some(Some("openai".to_string())),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        let cleared = users
            .update(
                "u1",
                UpdateUserData {
                    name: Some(None),
                    email_verified_at: Some(None),
                    totp_secret: Some(None),
                    avatar_key: Some(None),
                    default_llm_provider: Some(None),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(cleared.name, None);
        assert_eq!(cleared.email_verified_at, None);
        assert_eq!(cleared.totp_secret, None);
        assert_eq!(cleared.avatar_key, None);
        assert_eq!(cleared.default_llm_provider, None);
        // Absent from the second update, so untouched by it.
        assert_eq!(cleared.timezone.as_deref(), Some("Europe/London"));
    }

    #[tokio::test]
    async fn updating_to_an_email_already_taken_is_refused() {
        let users = repository_with_ada().await;
        users.create(user_data("u2", "grace@example.com")).await.unwrap();

        let err = users
            .update(
                "u2",
                UpdateUserData { email: Some("ada@example.com".to_string()), ..Default::default() },
            )
            .await;

        assert!(matches!(err, Err(DomainError::Internal(_))));
        assert_eq!(users.find_by_id("u2").await.unwrap().unwrap().email, "grace@example.com");
    }

    #[tokio::test]
    async fn updating_a_missing_user_is_an_error() {
        let users = repository_with_ada().await;
        let err = users.update("missing", UpdateUserData::default()).await;
        assert!(matches!(err, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn a_stored_digest_frequency_this_build_does_not_know_is_an_error() {
        let TestDb { db } = TestDb::create().await;
        seed_user(&db, "user-1").await;
        sqlx::query(r#"UPDATE "User" SET "digestFrequency" = 'hourly' WHERE "id" = 'user-1'"#)
            .execute(db.pool())
            .await
            .unwrap();

        let err = PgUserRepository::new(db).find_by_id("user-1").await;

        assert!(matches!(err, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn recording_a_digest_send_stores_it_and_moves_updated_at() {
        let users = repository_with_ada().await;
        let created = users.find_by_id("u1").await.unwrap().unwrap();
        let sent_at = now() - TimeDelta::minutes(3);
        tick().await;

        users.update_last_digest_sent_at("u1", sent_at).await.unwrap();

        let stored = users.find_by_id("u1").await.unwrap().unwrap();
        assert_eq!(stored.last_digest_sent_at, Some(sent_at));
        assert!(stored.updated_at > created.updated_at);
        assert_eq!(stored.email, created.email);
    }

    #[tokio::test]
    async fn deletes_a_user_and_ignores_an_unknown_id() {
        let users = repository_with_ada().await;

        users.delete("missing").await.unwrap();
        users.delete("u1").await.unwrap();

        assert_eq!(users.find_by_id("u1").await.unwrap(), None);
    }
}

mod sessions {
    use super::*;

    fn session_data(id: &str, user_id: &str) -> CreateSessionData {
        CreateSessionData {
            id: id.to_string(),
            user_id: user_id.to_string(),
            user_agent: None,
            ip_address: None,
            device_label: None,
            location: None,
            expires_at: in_a_week(),
            current_refresh_token_id: "refresh-token-1".to_string(),
        }
    }

    async fn revoked_ids(sessions: &PgSessionRepository, ids: &[&str]) -> Vec<String> {
        let mut revoked = Vec::new();
        for id in ids {
            if sessions.find_by_id(id).await.unwrap().unwrap().revoked_at.is_some() {
                revoked.push(id.to_string());
            }
        }
        revoked
    }

    #[tokio::test]
    async fn creates_and_reads_back_a_session() {
        let sessions = PgSessionRepository::new(seeded().await);
        let expires_at = in_a_week();

        let created = sessions
            .create(CreateSessionData {
                user_agent: Some("Mozilla/5.0".to_string()),
                ip_address: Some("10.0.0.1".to_string()),
                device_label: Some("Firefox on macOS".to_string()),
                location: Some("London, GB".to_string()),
                expires_at,
                ..session_data("session-1", "user-1")
            })
            .await
            .unwrap();

        assert_eq!(created.user_id, "user-1");
        assert_eq!(created.user_agent.as_deref(), Some("Mozilla/5.0"));
        assert_eq!(created.ip_address.as_deref(), Some("10.0.0.1"));
        assert_eq!(created.device_label.as_deref(), Some("Firefox on macOS"));
        assert_eq!(created.location.as_deref(), Some("London, GB"));
        assert_eq!(created.expires_at, expires_at);
        assert_eq!(created.last_used_at, created.created_at);
        assert_eq!(created.revoked_at, None);
        assert_eq!(created.current_refresh_token_id.as_deref(), Some("refresh-token-1"));
        assert_eq!(created.previous_refresh_token_id, None);
        assert_eq!(created.previous_rotated_at, None);
        assert_eq!(sessions.find_by_id("session-1").await.unwrap(), Some(created));
    }

    #[tokio::test]
    async fn stores_the_optional_columns_as_null() {
        let sessions = PgSessionRepository::new(seeded().await);

        let created = sessions.create(session_data("session-1", "user-1")).await.unwrap();

        assert_eq!(created.user_agent, None);
        assert_eq!(created.ip_address, None);
        assert_eq!(created.device_label, None);
        assert_eq!(created.location, None);
    }

    #[tokio::test]
    async fn finds_by_id_only_for_the_owning_user() {
        let sessions = PgSessionRepository::new(seeded().await);
        sessions.create(session_data("session-1", "user-1")).await.unwrap();

        assert_eq!(sessions.find_by_id("missing").await.unwrap(), None);
        let owned = sessions.find_by_id_and_user_id("session-1", "user-1").await.unwrap();
        assert_eq!(owned.unwrap().id, "session-1");
        assert_eq!(sessions.find_by_id_and_user_id("session-1", "user-2").await.unwrap(), None);
        assert_eq!(sessions.find_by_id_and_user_id("missing", "user-1").await.unwrap(), None);
    }

    #[tokio::test]
    async fn active_sessions_exclude_revoked_expired_and_foreign_ones() {
        let sessions = PgSessionRepository::new(seeded().await);
        sessions.create(session_data("active", "user-1")).await.unwrap();
        sessions.create(session_data("revoked", "user-1")).await.unwrap();
        sessions.revoke("revoked").await.unwrap();
        sessions
            .create(CreateSessionData {
                expires_at: now() - TimeDelta::seconds(1),
                ..session_data("expired", "user-1")
            })
            .await
            .unwrap();
        sessions.create(session_data("foreign", "user-2")).await.unwrap();

        let active = sessions.find_active_by_user_id("user-1").await.unwrap();

        let ids: Vec<&str> = active.iter().map(|session| session.id.as_str()).collect();
        assert_eq!(ids, vec!["active"]);
    }

    #[tokio::test]
    async fn active_sessions_come_most_recently_used_first() {
        let sessions = PgSessionRepository::new(seeded().await);
        sessions.create(session_data("first", "user-1")).await.unwrap();
        tick().await;
        sessions.create(session_data("second", "user-1")).await.unwrap();
        tick().await;
        sessions.create(session_data("third", "user-1")).await.unwrap();
        tick().await;
        sessions.touch("first", in_a_week()).await.unwrap();

        let active = sessions.find_active_by_user_id("user-1").await.unwrap();

        let ids: Vec<&str> = active.iter().map(|session| session.id.as_str()).collect();
        assert_eq!(ids, vec!["first", "third", "second"]);
    }

    #[tokio::test]
    async fn a_touch_moves_last_used_at_and_the_expiry() {
        let sessions = PgSessionRepository::new(seeded().await);
        let created = sessions.create(session_data("session-1", "user-1")).await.unwrap();
        let expires_at = now() + TimeDelta::days(30);
        tick().await;

        sessions.touch("session-1", expires_at).await.unwrap();

        let touched = sessions.find_by_id("session-1").await.unwrap().unwrap();
        assert!(touched.last_used_at > created.last_used_at);
        assert_eq!(touched.expires_at, expires_at);
        assert_eq!(touched.created_at, created.created_at);
        assert_eq!(touched.current_refresh_token_id, created.current_refresh_token_id);
    }

    #[tokio::test]
    async fn a_rotation_swaps_the_token_ids_and_moves_the_expiry() {
        let sessions = PgSessionRepository::new(seeded().await);
        let created = sessions.create(session_data("session-1", "user-1")).await.unwrap();
        let rotated_at = now();
        let expires_at = rotated_at + TimeDelta::days(30);
        tick().await;

        sessions
            .rotate_refresh_token(
                "session-1",
                RotateRefreshTokenData {
                    current_refresh_token_id: "refresh-token-2".to_string(),
                    previous_refresh_token_id: "refresh-token-1".to_string(),
                    previous_rotated_at: rotated_at,
                    expires_at,
                },
            )
            .await
            .unwrap();

        let rotated = sessions.find_by_id("session-1").await.unwrap().unwrap();
        assert_eq!(rotated.current_refresh_token_id.as_deref(), Some("refresh-token-2"));
        assert_eq!(rotated.previous_refresh_token_id.as_deref(), Some("refresh-token-1"));
        assert_eq!(rotated.previous_rotated_at, Some(rotated_at));
        assert_eq!(rotated.expires_at, expires_at);
        assert!(rotated.last_used_at > created.last_used_at);
        assert_eq!(rotated.revoked_at, None);
    }

    #[tokio::test]
    async fn revoking_stamps_only_that_session() {
        let sessions = PgSessionRepository::new(seeded().await);
        sessions.create(session_data("session-1", "user-1")).await.unwrap();
        sessions.create(session_data("session-2", "user-1")).await.unwrap();

        sessions.revoke("session-1").await.unwrap();
        sessions.revoke("missing").await.unwrap();

        assert_eq!(revoked_ids(&sessions, &["session-1", "session-2"]).await, vec!["session-1"]);
    }

    #[tokio::test]
    async fn revoking_all_but_one_spares_it_and_other_users() {
        let sessions = PgSessionRepository::new(seeded().await);
        for (id, user_id) in [("keep", "user-1"), ("drop-1", "user-1"), ("drop-2", "user-1")] {
            sessions.create(session_data(id, user_id)).await.unwrap();
        }
        sessions.create(session_data("foreign", "user-2")).await.unwrap();

        sessions.revoke_all_for_user_except("user-1", "keep").await.unwrap();

        let revoked = revoked_ids(&sessions, &["keep", "drop-1", "drop-2", "foreign"]).await;
        assert_eq!(revoked, vec!["drop-1", "drop-2"]);
    }

    #[tokio::test]
    async fn revoking_every_session_spares_other_users() {
        let sessions = PgSessionRepository::new(seeded().await);
        sessions.create(session_data("one", "user-1")).await.unwrap();
        sessions.create(session_data("two", "user-1")).await.unwrap();
        sessions.create(session_data("foreign", "user-2")).await.unwrap();

        sessions.revoke_all_for_user("user-1").await.unwrap();

        assert_eq!(revoked_ids(&sessions, &["one", "two", "foreign"]).await, vec!["one", "two"]);
        assert!(sessions.find_active_by_user_id("user-1").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_bulk_revoke_keeps_the_stamp_of_a_session_already_revoked() {
        let sessions = PgSessionRepository::new(seeded().await);
        sessions.create(session_data("early", "user-1")).await.unwrap();
        sessions.create(session_data("late", "user-1")).await.unwrap();
        sessions.revoke("early").await.unwrap();
        let first_stamp = sessions.find_by_id("early").await.unwrap().unwrap().revoked_at;
        tick().await;

        sessions.revoke_all_for_user("user-1").await.unwrap();
        sessions.revoke_all_for_user_except("user-1", "late").await.unwrap();

        assert_eq!(sessions.find_by_id("early").await.unwrap().unwrap().revoked_at, first_stamp);
        assert!(sessions.find_by_id("late").await.unwrap().unwrap().revoked_at > first_stamp);
    }

    #[tokio::test]
    async fn distinct_user_agents_skip_nulls_duplicates_and_other_users() {
        let sessions = PgSessionRepository::new(seeded().await);
        for (id, user_id, user_agent) in [
            ("a", "user-1", Some("Firefox")),
            ("b", "user-1", Some("Firefox")),
            ("c", "user-1", None),
            ("d", "user-1", Some("Safari")),
            ("e", "user-2", Some("Chrome")),
        ] {
            sessions
                .create(CreateSessionData {
                    user_agent: user_agent.map(str::to_string),
                    ..session_data(id, user_id)
                })
                .await
                .unwrap();
        }
        // A revoked session's fingerprint still counts as previously used.
        sessions.revoke("d").await.unwrap();

        let mut user_agents =
            sessions.find_distinct_user_agents_by_user_id("user-1").await.unwrap();
        user_agents.sort();

        assert_eq!(user_agents, vec!["Firefox", "Safari"]);
        assert!(sessions.find_distinct_user_agents_by_user_id("nobody").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_session_for_an_unknown_user_or_a_reused_id_is_refused() {
        let sessions = PgSessionRepository::new(seeded().await);
        sessions.create(session_data("session-1", "user-1")).await.unwrap();

        let orphan = sessions.create(session_data("session-2", "nobody")).await;
        let duplicate = sessions.create(session_data("session-1", "user-2")).await;

        assert!(matches!(orphan, Err(DomainError::Internal(_))));
        assert!(matches!(duplicate, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn deleting_the_user_cascades_to_their_sessions() {
        let db = seeded().await;
        let sessions = PgSessionRepository::new(db.clone());
        sessions.create(session_data("session-1", "user-1")).await.unwrap();

        delete_user(&db, "user-1").await;

        assert_eq!(sessions.find_by_id("session-1").await.unwrap(), None);
    }
}

mod login_events {
    use super::*;

    fn event_data(id: &str, user_id: &str) -> CreateLoginEventData {
        CreateLoginEventData {
            id: id.to_string(),
            user_id: user_id.to_string(),
            ip_address: Some("10.0.0.1".to_string()),
            user_agent: Some("Mozilla/5.0".to_string()),
        }
    }

    #[tokio::test]
    async fn creates_and_reads_back_a_login_event() {
        let events = PgLoginEventRepository::new(seeded().await);

        let created = events.create(event_data("event-1", "user-1")).await.unwrap();

        assert_eq!(created.id, "event-1");
        assert_eq!(created.user_id, "user-1");
        assert_eq!(created.ip_address.as_deref(), Some("10.0.0.1"));
        assert_eq!(created.user_agent.as_deref(), Some("Mozilla/5.0"));
        assert_eq!(events.find_recent_by_user_id("user-1", 10).await.unwrap(), vec![created]);
    }

    #[tokio::test]
    async fn stores_a_missing_ip_address_and_user_agent_as_null() {
        let events = PgLoginEventRepository::new(seeded().await);

        let created = events
            .create(CreateLoginEventData {
                ip_address: None,
                user_agent: None,
                ..event_data("event-1", "user-1")
            })
            .await
            .unwrap();

        assert_eq!(created.ip_address, None);
        assert_eq!(created.user_agent, None);
    }

    #[tokio::test]
    async fn lists_a_users_events_newest_first_up_to_the_limit() {
        let events = PgLoginEventRepository::new(seeded().await);
        for id in ["event-1", "event-2", "event-3"] {
            events.create(event_data(id, "user-1")).await.unwrap();
            tick().await;
        }
        events.create(event_data("foreign", "user-2")).await.unwrap();

        let recent = events.find_recent_by_user_id("user-1", 2).await.unwrap();

        let ids: Vec<&str> = recent.iter().map(|event| event.id.as_str()).collect();
        assert_eq!(ids, vec!["event-3", "event-2"]);
        assert_eq!(events.find_recent_by_user_id("user-1", 10).await.unwrap().len(), 3);
    }

    #[tokio::test]
    async fn lists_nothing_for_a_user_with_no_events() {
        let events = PgLoginEventRepository::new(seeded().await);
        assert!(events.find_recent_by_user_id("user-1", 10).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn deleting_the_user_cascades_to_their_login_events() {
        let db = seeded().await;
        let events = PgLoginEventRepository::new(db.clone());
        events.create(event_data("event-1", "user-1")).await.unwrap();

        delete_user(&db, "user-1").await;

        assert!(events.find_recent_by_user_id("user-1", 10).await.unwrap().is_empty());
    }
}

mod security_events {
    use super::*;

    fn event_data(
        id: &str,
        user_id: &str,
        event_type: SecurityEventType,
    ) -> CreateSecurityEventData {
        CreateSecurityEventData {
            id: id.to_string(),
            user_id: user_id.to_string(),
            event_type,
            ip_address: Some("10.0.0.1".to_string()),
            user_agent: Some("Mozilla/5.0".to_string()),
        }
    }

    #[tokio::test]
    async fn creates_and_reads_back_a_security_event() {
        let events = PgSecurityEventRepository::new(seeded().await);

        let created = events
            .create(event_data("event-1", "user-1", SecurityEventType::PasswordChanged))
            .await
            .unwrap();

        assert_eq!(created.user_id, "user-1");
        assert_eq!(created.event_type, SecurityEventType::PasswordChanged);
        assert_eq!(created.ip_address.as_deref(), Some("10.0.0.1"));
        assert_eq!(created.user_agent.as_deref(), Some("Mozilla/5.0"));
        assert_eq!(events.find_recent_by_user_id("user-1", 10).await.unwrap(), vec![created]);
    }

    #[tokio::test]
    async fn every_event_type_survives_a_round_trip() {
        let events = PgSecurityEventRepository::new(seeded().await);

        for (index, event_type) in SecurityEventType::ALL.into_iter().enumerate() {
            let created = events
                .create(event_data(&format!("event-{index}"), "user-1", event_type))
                .await
                .unwrap();
            assert_eq!(created.event_type, event_type);
        }

        assert_eq!(events.find_recent_by_user_id("user-1", 100).await.unwrap().len(), 12);
    }

    #[tokio::test]
    async fn stores_a_missing_ip_address_and_user_agent_as_null() {
        let events = PgSecurityEventRepository::new(seeded().await);

        let created = events
            .create(CreateSecurityEventData {
                ip_address: None,
                user_agent: None,
                ..event_data("event-1", "user-1", SecurityEventType::TotpEnabled)
            })
            .await
            .unwrap();

        assert_eq!(created.ip_address, None);
        assert_eq!(created.user_agent, None);
    }

    #[tokio::test]
    async fn lists_a_users_events_newest_first_up_to_the_limit() {
        let events = PgSecurityEventRepository::new(seeded().await);
        for (id, event_type) in [
            ("event-1", SecurityEventType::PasswordChanged),
            ("event-2", SecurityEventType::TotpEnabled),
            ("event-3", SecurityEventType::SessionRevoked),
        ] {
            events.create(event_data(id, "user-1", event_type)).await.unwrap();
            tick().await;
        }
        events
            .create(event_data("foreign", "user-2", SecurityEventType::EmailChanged))
            .await
            .unwrap();

        let recent = events.find_recent_by_user_id("user-1", 2).await.unwrap();

        let ids: Vec<&str> = recent.iter().map(|event| event.id.as_str()).collect();
        assert_eq!(ids, vec!["event-3", "event-2"]);
        assert_eq!(recent[0].event_type, SecurityEventType::SessionRevoked);
    }

    #[tokio::test]
    async fn lists_nothing_for_a_user_with_no_events() {
        let events = PgSecurityEventRepository::new(seeded().await);
        assert!(events.find_recent_by_user_id("user-1", 10).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_stored_event_type_this_build_does_not_know_is_an_error() {
        let db = seeded().await;
        sqlx::query(
            r#"INSERT INTO "SecurityEvent" ("id", "userId", "eventType", "createdAt")
               VALUES ('event-x', 'user-1', 'password_guessed', $1)"#,
        )
        .bind(now())
        .execute(db.pool())
        .await
        .unwrap();

        let err = PgSecurityEventRepository::new(db).find_recent_by_user_id("user-1", 10).await;

        assert!(matches!(err, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn deleting_the_user_cascades_to_their_security_events() {
        let db = seeded().await;
        let events = PgSecurityEventRepository::new(db.clone());
        events
            .create(event_data("event-1", "user-1", SecurityEventType::EmailChanged))
            .await
            .unwrap();

        delete_user(&db, "user-1").await;

        assert!(events.find_recent_by_user_id("user-1", 10).await.unwrap().is_empty());
    }
}

mod email_verification_tokens {
    use super::*;

    fn token_data(id: &str, user_id: &str, token_hash: &str) -> CreateEmailVerificationTokenData {
        CreateEmailVerificationTokenData {
            id: id.to_string(),
            user_id: user_id.to_string(),
            token_hash: token_hash.to_string(),
            new_email: None,
            expires_at: in_a_week(),
        }
    }

    #[tokio::test]
    async fn creates_and_reads_back_a_token() {
        let tokens = PgEmailVerificationTokenRepository::new(seeded().await);
        let data = token_data("token-1", "user-1", "hash-1");
        let expires_at = data.expires_at;

        let created = tokens.create(data).await.unwrap();

        assert_eq!(created.id, "token-1");
        assert_eq!(created.user_id, "user-1");
        assert_eq!(created.token_hash, "hash-1");
        assert_eq!(created.new_email, None);
        assert_eq!(created.expires_at, expires_at);
        assert_eq!(created.used_at, None);
        assert_eq!(tokens.find_by_token_hash("hash-1").await.unwrap(), Some(created));
    }

    #[tokio::test]
    async fn stores_the_new_email_of_an_email_change_token() {
        let tokens = PgEmailVerificationTokenRepository::new(seeded().await);

        let created = tokens
            .create(CreateEmailVerificationTokenData {
                new_email: Some("new@example.com".to_string()),
                ..token_data("token-1", "user-1", "hash-1")
            })
            .await
            .unwrap();

        assert_eq!(created.new_email.as_deref(), Some("new@example.com"));
    }

    #[tokio::test]
    async fn finds_nothing_for_an_unknown_hash() {
        let tokens = PgEmailVerificationTokenRepository::new(seeded().await);
        assert_eq!(tokens.find_by_token_hash("missing").await.unwrap(), None);
    }

    #[tokio::test]
    async fn a_second_token_with_the_same_hash_is_refused() {
        let tokens = PgEmailVerificationTokenRepository::new(seeded().await);
        tokens.create(token_data("token-1", "user-1", "hash-1")).await.unwrap();

        let err = tokens.create(token_data("token-2", "user-2", "hash-1")).await;

        assert!(matches!(err, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn marking_used_stamps_only_that_token() {
        let tokens = PgEmailVerificationTokenRepository::new(seeded().await);
        tokens.create(token_data("token-1", "user-1", "hash-1")).await.unwrap();
        tokens.create(token_data("token-2", "user-1", "hash-2")).await.unwrap();

        tokens.mark_used("token-1").await.unwrap();
        tokens.mark_used("missing").await.unwrap();

        assert!(tokens.find_by_token_hash("hash-1").await.unwrap().unwrap().used_at.is_some());
        assert_eq!(tokens.find_by_token_hash("hash-2").await.unwrap().unwrap().used_at, None);
    }

    #[tokio::test]
    async fn deleting_a_users_tokens_spares_other_users() {
        let tokens = PgEmailVerificationTokenRepository::new(seeded().await);
        tokens.create(token_data("token-1", "user-1", "hash-1")).await.unwrap();
        tokens.create(token_data("token-2", "user-1", "hash-2")).await.unwrap();
        tokens.create(token_data("token-3", "user-2", "hash-3")).await.unwrap();

        tokens.delete_all_for_user("user-1").await.unwrap();

        assert_eq!(tokens.find_by_token_hash("hash-1").await.unwrap(), None);
        assert_eq!(tokens.find_by_token_hash("hash-2").await.unwrap(), None);
        assert!(tokens.find_by_token_hash("hash-3").await.unwrap().is_some());
    }

    #[tokio::test]
    async fn deleting_the_user_cascades_to_their_tokens() {
        let db = seeded().await;
        let tokens = PgEmailVerificationTokenRepository::new(db.clone());
        tokens.create(token_data("token-1", "user-1", "hash-1")).await.unwrap();

        delete_user(&db, "user-1").await;

        assert_eq!(tokens.find_by_token_hash("hash-1").await.unwrap(), None);
    }
}

mod backup_email_verification_tokens {
    use super::*;

    fn token_data(
        id: &str,
        user_id: &str,
        token_hash: &str,
    ) -> CreateBackupEmailVerificationTokenData {
        CreateBackupEmailVerificationTokenData {
            id: id.to_string(),
            user_id: user_id.to_string(),
            token_hash: token_hash.to_string(),
            new_backup_email: "spare@example.com".to_string(),
            expires_at: in_a_week(),
        }
    }

    #[tokio::test]
    async fn creates_and_reads_back_a_token() {
        let tokens = PgBackupEmailVerificationTokenRepository::new(seeded().await);
        let data = token_data("token-1", "user-1", "hash-1");
        let expires_at = data.expires_at;

        let created = tokens.create(data).await.unwrap();

        assert_eq!(created.id, "token-1");
        assert_eq!(created.user_id, "user-1");
        assert_eq!(created.token_hash, "hash-1");
        assert_eq!(created.new_backup_email, "spare@example.com");
        assert_eq!(created.expires_at, expires_at);
        assert_eq!(created.used_at, None);
        assert_eq!(tokens.find_by_token_hash("hash-1").await.unwrap(), Some(created));
    }

    #[tokio::test]
    async fn finds_nothing_for_an_unknown_hash() {
        let tokens = PgBackupEmailVerificationTokenRepository::new(seeded().await);
        assert_eq!(tokens.find_by_token_hash("missing").await.unwrap(), None);
    }

    #[tokio::test]
    async fn a_second_token_with_the_same_hash_is_refused() {
        let tokens = PgBackupEmailVerificationTokenRepository::new(seeded().await);
        tokens.create(token_data("token-1", "user-1", "hash-1")).await.unwrap();

        let err = tokens.create(token_data("token-2", "user-2", "hash-1")).await;

        assert!(matches!(err, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn marking_used_stamps_only_that_token() {
        let tokens = PgBackupEmailVerificationTokenRepository::new(seeded().await);
        tokens.create(token_data("token-1", "user-1", "hash-1")).await.unwrap();
        tokens.create(token_data("token-2", "user-1", "hash-2")).await.unwrap();

        tokens.mark_used("token-1").await.unwrap();
        tokens.mark_used("missing").await.unwrap();

        assert!(tokens.find_by_token_hash("hash-1").await.unwrap().unwrap().used_at.is_some());
        assert_eq!(tokens.find_by_token_hash("hash-2").await.unwrap().unwrap().used_at, None);
    }

    #[tokio::test]
    async fn deleting_a_users_tokens_spares_other_users() {
        let tokens = PgBackupEmailVerificationTokenRepository::new(seeded().await);
        tokens.create(token_data("token-1", "user-1", "hash-1")).await.unwrap();
        tokens.create(token_data("token-2", "user-1", "hash-2")).await.unwrap();
        tokens.create(token_data("token-3", "user-2", "hash-3")).await.unwrap();

        tokens.delete_all_for_user("user-1").await.unwrap();

        assert_eq!(tokens.find_by_token_hash("hash-1").await.unwrap(), None);
        assert_eq!(tokens.find_by_token_hash("hash-2").await.unwrap(), None);
        assert!(tokens.find_by_token_hash("hash-3").await.unwrap().is_some());
    }

    #[tokio::test]
    async fn deleting_the_user_cascades_to_their_tokens() {
        let db = seeded().await;
        let tokens = PgBackupEmailVerificationTokenRepository::new(db.clone());
        tokens.create(token_data("token-1", "user-1", "hash-1")).await.unwrap();

        delete_user(&db, "user-1").await;

        assert_eq!(tokens.find_by_token_hash("hash-1").await.unwrap(), None);
    }
}

mod password_reset_tokens {
    use super::*;

    fn token_data(id: &str, user_id: &str, token_hash: &str) -> CreatePasswordResetTokenData {
        CreatePasswordResetTokenData {
            id: id.to_string(),
            user_id: user_id.to_string(),
            token_hash: token_hash.to_string(),
            expires_at: in_a_week(),
        }
    }

    #[tokio::test]
    async fn creates_and_reads_back_a_token() {
        let tokens = PgPasswordResetTokenRepository::new(seeded().await);
        let data = token_data("token-1", "user-1", "hash-1");
        let expires_at = data.expires_at;

        let created = tokens.create(data).await.unwrap();

        assert_eq!(created.id, "token-1");
        assert_eq!(created.user_id, "user-1");
        assert_eq!(created.token_hash, "hash-1");
        assert_eq!(created.expires_at, expires_at);
        assert_eq!(created.used_at, None);
        assert_eq!(tokens.find_by_token_hash("hash-1").await.unwrap(), Some(created));
    }

    #[tokio::test]
    async fn finds_nothing_for_an_unknown_hash() {
        let tokens = PgPasswordResetTokenRepository::new(seeded().await);
        assert_eq!(tokens.find_by_token_hash("missing").await.unwrap(), None);
    }

    #[tokio::test]
    async fn a_second_token_with_the_same_hash_is_refused() {
        let tokens = PgPasswordResetTokenRepository::new(seeded().await);
        tokens.create(token_data("token-1", "user-1", "hash-1")).await.unwrap();

        let err = tokens.create(token_data("token-2", "user-2", "hash-1")).await;

        assert!(matches!(err, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn marking_used_stamps_only_that_token() {
        let tokens = PgPasswordResetTokenRepository::new(seeded().await);
        tokens.create(token_data("token-1", "user-1", "hash-1")).await.unwrap();
        tokens.create(token_data("token-2", "user-1", "hash-2")).await.unwrap();

        tokens.mark_used("token-1").await.unwrap();
        tokens.mark_used("missing").await.unwrap();

        assert!(tokens.find_by_token_hash("hash-1").await.unwrap().unwrap().used_at.is_some());
        assert_eq!(tokens.find_by_token_hash("hash-2").await.unwrap().unwrap().used_at, None);
    }

    #[tokio::test]
    async fn deleting_a_users_tokens_spares_other_users() {
        let tokens = PgPasswordResetTokenRepository::new(seeded().await);
        tokens.create(token_data("token-1", "user-1", "hash-1")).await.unwrap();
        tokens.create(token_data("token-2", "user-1", "hash-2")).await.unwrap();
        tokens.create(token_data("token-3", "user-2", "hash-3")).await.unwrap();

        tokens.delete_all_for_user("user-1").await.unwrap();

        assert_eq!(tokens.find_by_token_hash("hash-1").await.unwrap(), None);
        assert_eq!(tokens.find_by_token_hash("hash-2").await.unwrap(), None);
        assert!(tokens.find_by_token_hash("hash-3").await.unwrap().is_some());
    }

    #[tokio::test]
    async fn deleting_the_user_cascades_to_their_tokens() {
        let db = seeded().await;
        let tokens = PgPasswordResetTokenRepository::new(db.clone());
        tokens.create(token_data("token-1", "user-1", "hash-1")).await.unwrap();

        delete_user(&db, "user-1").await;

        assert_eq!(tokens.find_by_token_hash("hash-1").await.unwrap(), None);
    }
}

mod totp_backup_codes {
    use super::*;

    fn code_data(id: &str, user_id: &str, code_hash: &str) -> CreateTotpBackupCodeData {
        CreateTotpBackupCodeData {
            id: id.to_string(),
            user_id: user_id.to_string(),
            code_hash: code_hash.to_string(),
        }
    }

    #[tokio::test]
    async fn creates_and_reads_back_a_code() {
        let codes = PgTotpBackupCodeRepository::new(seeded().await);

        let created = codes.create(code_data("code-1", "user-1", "hash-1")).await.unwrap();

        assert_eq!(created.id, "code-1");
        assert_eq!(created.user_id, "user-1");
        assert_eq!(created.code_hash, "hash-1");
        assert_eq!(created.used_at, None);
        assert_eq!(codes.find_by_code_hash("hash-1").await.unwrap(), Some(created));
    }

    #[tokio::test]
    async fn finds_nothing_for_an_unknown_hash() {
        let codes = PgTotpBackupCodeRepository::new(seeded().await);
        assert_eq!(codes.find_by_code_hash("missing").await.unwrap(), None);
    }

    #[tokio::test]
    async fn a_second_code_with_the_same_hash_is_refused() {
        let codes = PgTotpBackupCodeRepository::new(seeded().await);
        codes.create(code_data("code-1", "user-1", "hash-1")).await.unwrap();

        let err = codes.create(code_data("code-2", "user-2", "hash-1")).await;

        assert!(matches!(err, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn marking_used_stamps_only_that_code() {
        let codes = PgTotpBackupCodeRepository::new(seeded().await);
        codes.create(code_data("code-1", "user-1", "hash-1")).await.unwrap();
        codes.create(code_data("code-2", "user-1", "hash-2")).await.unwrap();

        codes.mark_used("code-1").await.unwrap();
        codes.mark_used("missing").await.unwrap();

        assert!(codes.find_by_code_hash("hash-1").await.unwrap().unwrap().used_at.is_some());
        assert_eq!(codes.find_by_code_hash("hash-2").await.unwrap().unwrap().used_at, None);
    }

    #[tokio::test]
    async fn deleting_a_users_codes_spares_other_users() {
        let codes = PgTotpBackupCodeRepository::new(seeded().await);
        codes.create(code_data("code-1", "user-1", "hash-1")).await.unwrap();
        codes.create(code_data("code-2", "user-1", "hash-2")).await.unwrap();
        codes.create(code_data("code-3", "user-2", "hash-3")).await.unwrap();

        codes.delete_all_for_user("user-1").await.unwrap();

        assert_eq!(codes.find_by_code_hash("hash-1").await.unwrap(), None);
        assert_eq!(codes.find_by_code_hash("hash-2").await.unwrap(), None);
        assert!(codes.find_by_code_hash("hash-3").await.unwrap().is_some());
    }

    #[tokio::test]
    async fn deleting_the_user_cascades_to_their_codes() {
        let db = seeded().await;
        let codes = PgTotpBackupCodeRepository::new(db.clone());
        codes.create(code_data("code-1", "user-1", "hash-1")).await.unwrap();

        delete_user(&db, "user-1").await;

        assert_eq!(codes.find_by_code_hash("hash-1").await.unwrap(), None);
    }
}

mod oauth_accounts {
    use super::*;

    fn account_data(
        id: &str,
        user_id: &str,
        provider: OAuthProviderName,
        provider_account_id: &str,
    ) -> CreateOAuthAccountData {
        CreateOAuthAccountData {
            id: id.to_string(),
            user_id: user_id.to_string(),
            provider,
            provider_account_id: provider_account_id.to_string(),
            email: Some("ada@example.com".to_string()),
        }
    }

    #[tokio::test]
    async fn creates_and_reads_back_a_link() {
        let accounts = PgOAuthAccountRepository::new(seeded().await);

        let created = accounts
            .create(account_data("link-1", "user-1", OAuthProviderName::Google, "g-123"))
            .await
            .unwrap();

        assert_eq!(created.id, "link-1");
        assert_eq!(created.user_id, "user-1");
        assert_eq!(created.provider, OAuthProviderName::Google);
        assert_eq!(created.provider_account_id, "g-123");
        assert_eq!(created.email.as_deref(), Some("ada@example.com"));
        let found = accounts.find_by_provider(OAuthProviderName::Google, "g-123").await.unwrap();
        assert_eq!(found, Some(created));
    }

    #[tokio::test]
    async fn stores_a_missing_email_as_null() {
        let accounts = PgOAuthAccountRepository::new(seeded().await);

        let created = accounts
            .create(CreateOAuthAccountData {
                email: None,
                ..account_data("link-1", "user-1", OAuthProviderName::Github, "gh-1")
            })
            .await
            .unwrap();

        assert_eq!(created.email, None);
    }

    #[tokio::test]
    async fn the_same_account_id_under_another_provider_is_a_different_link() {
        let accounts = PgOAuthAccountRepository::new(seeded().await);
        accounts
            .create(account_data("link-1", "user-1", OAuthProviderName::Google, "same-id"))
            .await
            .unwrap();
        accounts
            .create(account_data("link-2", "user-2", OAuthProviderName::Github, "same-id"))
            .await
            .unwrap();

        let google = accounts.find_by_provider(OAuthProviderName::Google, "same-id").await.unwrap();
        let github = accounts.find_by_provider(OAuthProviderName::Github, "same-id").await.unwrap();

        assert_eq!(google.unwrap().user_id, "user-1");
        assert_eq!(github.unwrap().user_id, "user-2");
        assert_eq!(
            accounts.find_by_provider(OAuthProviderName::Google, "nope").await.unwrap(),
            None
        );
    }

    #[tokio::test]
    async fn a_provider_account_can_be_linked_only_once() {
        let accounts = PgOAuthAccountRepository::new(seeded().await);
        accounts
            .create(account_data("link-1", "user-1", OAuthProviderName::Google, "g-123"))
            .await
            .unwrap();

        let err = accounts
            .create(account_data("link-2", "user-2", OAuthProviderName::Google, "g-123"))
            .await;

        assert!(matches!(err, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn lists_only_the_users_own_links() {
        let accounts = PgOAuthAccountRepository::new(seeded().await);
        accounts
            .create(account_data("link-1", "user-1", OAuthProviderName::Google, "g-1"))
            .await
            .unwrap();
        accounts
            .create(account_data("link-2", "user-1", OAuthProviderName::Github, "gh-1"))
            .await
            .unwrap();
        accounts
            .create(account_data("link-3", "user-2", OAuthProviderName::Google, "g-2"))
            .await
            .unwrap();

        let listed = accounts.find_all_by_user_id("user-1").await.unwrap();

        let mut ids: Vec<&str> = listed.iter().map(|account| account.id.as_str()).collect();
        ids.sort();
        assert_eq!(ids, vec!["link-1", "link-2"]);
        assert!(accounts.find_all_by_user_id("nobody").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn deletes_a_link() {
        let accounts = PgOAuthAccountRepository::new(seeded().await);
        accounts
            .create(account_data("link-1", "user-1", OAuthProviderName::Google, "g-1"))
            .await
            .unwrap();

        accounts.delete("link-1").await.unwrap();
        accounts.delete("missing").await.unwrap();

        assert!(accounts.find_all_by_user_id("user-1").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_stored_provider_this_build_does_not_know_is_an_error() {
        let db = seeded().await;
        sqlx::query(
            r#"INSERT INTO "OAuthAccount" ("id", "userId", "provider", "providerAccountId", "createdAt")
               VALUES ('link-x', 'user-1', 'gitlab', 'gl-1', $1)"#,
        )
        .bind(now())
        .execute(db.pool())
        .await
        .unwrap();

        let err = PgOAuthAccountRepository::new(db).find_all_by_user_id("user-1").await;

        assert!(matches!(err, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn deleting_the_user_cascades_to_their_links() {
        let db = seeded().await;
        let accounts = PgOAuthAccountRepository::new(db.clone());
        accounts
            .create(account_data("link-1", "user-1", OAuthProviderName::Google, "g-1"))
            .await
            .unwrap();

        delete_user(&db, "user-1").await;

        assert_eq!(
            accounts.find_by_provider(OAuthProviderName::Google, "g-1").await.unwrap(),
            None
        );
    }
}
