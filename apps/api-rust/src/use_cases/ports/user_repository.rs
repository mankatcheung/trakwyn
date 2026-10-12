use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::user::{DigestFrequency, User};
use crate::use_cases::errors::DomainResult;

/// The optional fields are stored as null when `None`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CreateUserData {
    pub id: String,
    pub email: String,
    pub password_hash: Option<String>,
    pub name: Option<String>,
    pub email_verified_at: Option<DateTime<Utc>>,
}

/// A partial update: a `None` field leaves its column untouched. For a
/// nullable column the inner `Option` is the value, so `Some(None)` stores
/// null.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UpdateUserData {
    pub email: Option<String>,
    pub password_hash: Option<String>,
    pub name: Option<Option<String>>,
    pub timezone: Option<Option<String>>,
    pub target_role: Option<Option<String>>,
    pub email_verified_at: Option<Option<DateTime<Utc>>>,
    pub avatar_key: Option<Option<String>>,
    pub weekly_digest_enabled: Option<bool>,
    pub digest_frequency: Option<DigestFrequency>,
    pub follow_up_reminders_enabled: Option<bool>,
    pub push_notifications_enabled: Option<bool>,
    pub weekly_application_goal: Option<i32>,
    pub totp_secret: Option<Option<String>>,
    pub totp_enabled: Option<bool>,
    pub default_llm_provider: Option<Option<String>>,
    pub custom_ai_prompt: Option<Option<String>>,
    pub use_cross_application_context: Option<bool>,
    pub llm_fallback_when_limited: Option<bool>,
    pub backup_email: Option<Option<String>>,
    pub backup_email_verified_at: Option<Option<DateTime<Utc>>>,
    pub onboarding_checklist_dismissed_at: Option<Option<DateTime<Utc>>>,
}

#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<User>>;
    /// An exact, case-sensitive match.
    async fn find_by_email(&self, email: &str) -> DomainResult<Option<User>>;
    async fn find_by_backup_email(&self, email: &str) -> DomainResult<Option<User>>;
    /// Oldest first.
    async fn find_all(&self) -> DomainResult<Vec<User>>;
    async fn create(&self, data: CreateUserData) -> DomainResult<User>;
    /// Moves `updated_at` even when `data` names no field.
    async fn update(&self, id: &str, data: UpdateUserData) -> DomainResult<User>;
    async fn delete(&self, id: &str) -> DomainResult<()>;
    async fn update_last_digest_sent_at(
        &self,
        id: &str,
        sent_at: DateTime<Utc>,
    ) -> DomainResult<()>;
}
