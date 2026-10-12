use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DigestFrequency {
    Daily,
    Weekly,
    Off,
}

impl DigestFrequency {
    pub const ALL: [Self; 3] = [Self::Daily, Self::Weekly, Self::Off];

    /// The value stored in `User.digestFrequency` and sent over GraphQL.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Daily => "daily",
            Self::Weekly => "weekly",
            Self::Off => "off",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|frequency| frequency.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct User {
    pub id: String,
    pub email: String,
    /// `None` for accounts created via OAuth sign-up that never set a password.
    pub password_hash: Option<String>,
    pub name: Option<String>,
    pub timezone: Option<String>,
    pub target_role: Option<String>,
    pub email_verified_at: Option<DateTime<Utc>>,
    pub avatar_key: Option<String>,
    pub weekly_digest_enabled: bool,
    pub digest_frequency: DigestFrequency,
    pub last_digest_sent_at: Option<DateTime<Utc>>,
    pub follow_up_reminders_enabled: bool,
    pub push_notifications_enabled: bool,
    pub weekly_application_goal: i32,
    pub totp_secret: Option<String>,
    pub totp_enabled: bool,
    /// Which of the user's configured LlmApiKey providers is used for automatic AI features.
    pub default_llm_provider: Option<String>,
    /// User-authored instruction spliced into the system prompt for
    /// AI-generated text (cover letters, chat assistant).
    pub custom_ai_prompt: Option<String>,
    /// Opt-in (JEF-249): feed a small, recent slice of the user's other
    /// applications' notes/cover letters into cover letter generation.
    pub use_cross_application_context: bool,
    /// Fall through to another key when one hits its monthly limit (JEF-258).
    pub llm_fallback_when_limited: bool,
    /// Secondary email for account recovery when the primary inbox is inaccessible.
    pub backup_email: Option<String>,
    /// When the backup email was verified; `None` until verification completes.
    pub backup_email_verified_at: Option<DateTime<Utc>>,
    /// When the user dismissed the dashboard onboarding checklist (JEF-333).
    pub onboarding_checklist_dismissed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn digest_frequency_round_trips_through_its_stored_value() {
        for frequency in DigestFrequency::ALL {
            assert_eq!(DigestFrequency::parse(frequency.as_str()), Some(frequency));
        }
    }

    #[test]
    fn an_unknown_digest_frequency_does_not_parse() {
        assert_eq!(DigestFrequency::parse("hourly"), None);
    }
}
