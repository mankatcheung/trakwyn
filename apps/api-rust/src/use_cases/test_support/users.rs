use std::sync::Mutex;

use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::user::{DigestFrequency, User};
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{CreateUserData, UpdateUserData, UserRepository};

/// A user as the table's column defaults leave it: a password, nothing
/// verified, no profile.
pub fn user_with_email(id: &str, email: &str) -> User {
    let epoch = DateTime::<Utc>::UNIX_EPOCH;
    User {
        id: id.to_string(),
        email: email.to_string(),
        password_hash: Some("hashed".to_string()),
        name: None,
        timezone: None,
        target_role: None,
        email_verified_at: None,
        avatar_key: None,
        weekly_digest_enabled: true,
        digest_frequency: DigestFrequency::Weekly,
        last_digest_sent_at: None,
        follow_up_reminders_enabled: true,
        push_notifications_enabled: false,
        weekly_application_goal: 5,
        totp_secret: None,
        totp_enabled: false,
        default_llm_provider: None,
        custom_ai_prompt: None,
        use_cross_application_context: false,
        llm_fallback_when_limited: false,
        backup_email: None,
        backup_email_verified_at: None,
        onboarding_checklist_dismissed_at: None,
        created_at: epoch,
        updated_at: epoch,
    }
}

/// What a failed unique constraint or a missing `RETURNING` row is to a use
/// case: an infrastructure failure.
fn storage_error(message: &str) -> DomainError {
    DomainError::internal(message.to_string())
}

fn apply(user: &User, data: UpdateUserData) -> User {
    let current = user.clone();
    User {
        email: data.email.unwrap_or(current.email),
        password_hash: data.password_hash.map(Some).unwrap_or(current.password_hash),
        name: data.name.unwrap_or(current.name),
        timezone: data.timezone.unwrap_or(current.timezone),
        target_role: data.target_role.unwrap_or(current.target_role),
        email_verified_at: data.email_verified_at.unwrap_or(current.email_verified_at),
        avatar_key: data.avatar_key.unwrap_or(current.avatar_key),
        weekly_digest_enabled: data.weekly_digest_enabled.unwrap_or(current.weekly_digest_enabled),
        digest_frequency: data.digest_frequency.unwrap_or(current.digest_frequency),
        follow_up_reminders_enabled: data
            .follow_up_reminders_enabled
            .unwrap_or(current.follow_up_reminders_enabled),
        push_notifications_enabled: data
            .push_notifications_enabled
            .unwrap_or(current.push_notifications_enabled),
        weekly_application_goal: data
            .weekly_application_goal
            .unwrap_or(current.weekly_application_goal),
        totp_secret: data.totp_secret.unwrap_or(current.totp_secret),
        totp_enabled: data.totp_enabled.unwrap_or(current.totp_enabled),
        default_llm_provider: data.default_llm_provider.unwrap_or(current.default_llm_provider),
        custom_ai_prompt: data.custom_ai_prompt.unwrap_or(current.custom_ai_prompt),
        use_cross_application_context: data
            .use_cross_application_context
            .unwrap_or(current.use_cross_application_context),
        llm_fallback_when_limited: data
            .llm_fallback_when_limited
            .unwrap_or(current.llm_fallback_when_limited),
        backup_email: data.backup_email.unwrap_or(current.backup_email),
        backup_email_verified_at: data
            .backup_email_verified_at
            .unwrap_or(current.backup_email_verified_at),
        onboarding_checklist_dismissed_at: data
            .onboarding_checklist_dismissed_at
            .unwrap_or(current.onboarding_checklist_dismissed_at),
        updated_at: now(),
        ..current
    }
}

#[derive(Default)]
pub struct FakeUserRepository {
    users: Mutex<Vec<User>>,
}

impl FakeUserRepository {
    pub fn with(users: Vec<User>) -> Self {
        Self { users: Mutex::new(users) }
    }

    pub fn all(&self) -> Vec<User> {
        self.users.lock().unwrap().clone()
    }
}

#[async_trait]
impl UserRepository for FakeUserRepository {
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<User>> {
        Ok(self.all().into_iter().find(|user| user.id == id))
    }

    async fn find_by_email(&self, email: &str) -> DomainResult<Option<User>> {
        Ok(self.all().into_iter().find(|user| user.email == email))
    }

    async fn find_by_backup_email(&self, email: &str) -> DomainResult<Option<User>> {
        Ok(self.all().into_iter().find(|user| user.backup_email.as_deref() == Some(email)))
    }

    async fn find_all(&self) -> DomainResult<Vec<User>> {
        let mut users = self.all();
        users.sort_by_key(|user| user.created_at);
        Ok(users)
    }

    async fn create(&self, data: CreateUserData) -> DomainResult<User> {
        let mut users = self.users.lock().unwrap();
        if users.iter().any(|user| user.id == data.id || user.email == data.email) {
            return Err(storage_error("duplicate key value violates a \"User\" constraint"));
        }
        let timestamp = now();
        let user = User {
            password_hash: data.password_hash,
            name: data.name,
            email_verified_at: data.email_verified_at,
            created_at: timestamp,
            updated_at: timestamp,
            ..user_with_email(&data.id, &data.email)
        };
        users.push(user.clone());
        Ok(user)
    }

    async fn update(&self, id: &str, data: UpdateUserData) -> DomainResult<User> {
        let mut users = self.users.lock().unwrap();
        let position = users
            .iter()
            .position(|user| user.id == id)
            .ok_or_else(|| storage_error("no rows returned by the \"User\" update"))?;
        let updated = apply(&users[position], data);
        if users.iter().any(|user| user.id != id && user.email == updated.email) {
            return Err(storage_error("duplicate key value violates \"User_email_unique\""));
        }
        users[position] = updated.clone();
        Ok(updated)
    }

    async fn delete(&self, id: &str) -> DomainResult<()> {
        self.users.lock().unwrap().retain(|user| user.id != id);
        Ok(())
    }

    async fn update_last_digest_sent_at(
        &self,
        id: &str,
        sent_at: DateTime<Utc>,
    ) -> DomainResult<()> {
        let mut users = self.users.lock().unwrap();
        if let Some(user) = users.iter_mut().find(|user| user.id == id) {
            *user = User { last_digest_sent_at: Some(sent_at), updated_at: now(), ..user.clone() };
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_data(id: &str, email: &str) -> CreateUserData {
        CreateUserData { id: id.to_string(), email: email.to_string(), ..Default::default() }
    }

    #[tokio::test]
    async fn creates_a_user_with_the_column_defaults() {
        let users = FakeUserRepository::default();

        let created = users.create(create_data("u1", "a@b.com")).await.unwrap();

        assert_eq!(created.password_hash, None);
        assert_eq!(created.digest_frequency, DigestFrequency::Weekly);
        assert_eq!(created.weekly_application_goal, 5);
        assert_eq!(users.find_by_email("a@b.com").await.unwrap(), Some(created));
        assert_eq!(users.find_by_email("A@B.com").await.unwrap(), None);
    }

    #[tokio::test]
    async fn refuses_a_second_user_with_the_same_email() {
        let users = FakeUserRepository::with(vec![user_with_email("u1", "a@b.com")]);

        let err = users.create(create_data("u2", "a@b.com")).await;

        assert!(matches!(err, Err(DomainError::Internal(_))));
        assert_eq!(users.all().len(), 1);
    }

    #[tokio::test]
    async fn an_update_touches_only_the_named_fields() {
        let seeded = User { name: Some("Ada".to_string()), ..user_with_email("u1", "a@b.com") };
        let users = FakeUserRepository::with(vec![seeded.clone()]);

        let updated = users
            .update(
                "u1",
                UpdateUserData {
                    timezone: Some(Some("Europe/London".to_string())),
                    totp_enabled: Some(true),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.name, Some("Ada".to_string()));
        assert_eq!(updated.timezone, Some("Europe/London".to_string()));
        assert!(updated.totp_enabled);
        assert_eq!(updated.password_hash, seeded.password_hash);
        assert!(updated.updated_at > seeded.updated_at);
    }

    #[tokio::test]
    async fn an_update_can_null_a_nullable_field() {
        let seeded = User { name: Some("Ada".to_string()), ..user_with_email("u1", "a@b.com") };
        let users = FakeUserRepository::with(vec![seeded]);

        let updated = users
            .update("u1", UpdateUserData { name: Some(None), ..Default::default() })
            .await
            .unwrap();

        assert_eq!(updated.name, None);
    }

    #[tokio::test]
    async fn updating_a_missing_user_is_a_storage_failure() {
        let users = FakeUserRepository::default();
        let err = users.update("missing", UpdateUserData::default()).await;
        assert!(matches!(err, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn finds_by_backup_email_and_lists_oldest_first() {
        let older = user_with_email("old", "old@b.com");
        let newer = User {
            backup_email: Some("spare@b.com".to_string()),
            created_at: now(),
            ..user_with_email("new", "new@b.com")
        };
        let users = FakeUserRepository::with(vec![newer.clone(), older.clone()]);

        assert_eq!(users.find_by_backup_email("spare@b.com").await.unwrap(), Some(newer.clone()));
        assert_eq!(users.find_all().await.unwrap(), vec![older, newer]);
    }

    #[tokio::test]
    async fn records_the_digest_send_and_deletes() {
        let users = FakeUserRepository::with(vec![user_with_email("u1", "a@b.com")]);
        let sent_at = now();

        users.update_last_digest_sent_at("u1", sent_at).await.unwrap();
        assert_eq!(
            users.find_by_id("u1").await.unwrap().unwrap().last_digest_sent_at,
            Some(sent_at)
        );

        users.delete("u1").await.unwrap();
        assert_eq!(users.find_by_id("u1").await.unwrap(), None);
    }
}
