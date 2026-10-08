use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::use_cases::errors::DomainResult;

/// One application named in a digest.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DigestApplication {
    pub company: String,
    pub role: String,
}

/// One application with a follow-up date, overdue or upcoming.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DigestFollowUp {
    pub company: String,
    pub role: String,
    pub follow_up_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct WeeklyDigestData {
    pub total_applications: i64,
    /// Status → count, in the order the rows should appear.
    pub by_status: Vec<(String, i64)>,
    pub new_this_week: Vec<DigestApplication>,
    pub overdue_follow_ups: Vec<DigestFollowUp>,
    pub upcoming_follow_ups: Vec<DigestFollowUp>,
    /// The goal block is only rendered when this is set.
    pub weekly_application_goal: Option<i64>,
    pub current_week_application_count: Option<i64>,
    pub application_streak_weeks: Option<i64>,
}

/// How often a user receives the digest. `apps/api` defaults to weekly when
/// the caller does not say.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum DigestFrequency {
    Daily,
    #[default]
    Weekly,
}

impl DigestFrequency {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Daily => "daily",
            Self::Weekly => "weekly",
        }
    }
}

#[async_trait]
pub trait EmailService: Send + Sync {
    async fn send_follow_up_reminder(
        &self,
        to: &str,
        company: &str,
        role: &str,
        follow_up_at: DateTime<Utc>,
    ) -> DomainResult<()>;

    async fn send_weekly_digest(
        &self,
        to: &str,
        data: &WeeklyDigestData,
        frequency: DigestFrequency,
    ) -> DomainResult<()>;

    async fn send_password_reset(&self, to: &str, reset_url: &str) -> DomainResult<()>;

    async fn send_email_verification(&self, to: &str, verify_url: &str) -> DomainResult<()>;

    async fn send_backup_email_verification(&self, to: &str, verify_url: &str) -> DomainResult<()>;

    async fn send_new_device_login_alert(
        &self,
        to: &str,
        device_label: &str,
        location: Option<&str>,
        ip_address: Option<&str>,
        login_time: DateTime<Utc>,
    ) -> DomainResult<()>;
}
