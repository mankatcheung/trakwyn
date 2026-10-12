use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SecurityEventType {
    PasswordChanged,
    EmailChanged,
    TotpEnabled,
    TotpDisabled,
    TotpBackupCodesRegenerated,
    SessionRevoked,
    OtherSessionsRevoked,
    McpOauthAuthorized,
    McpOauthTokenIssued,
    McpOauthRefreshReuseDetected,
    McpOauthCodeReuseDetected,
    McpOauthTokenRevoked,
}

impl SecurityEventType {
    pub const ALL: [Self; 12] = [
        Self::PasswordChanged,
        Self::EmailChanged,
        Self::TotpEnabled,
        Self::TotpDisabled,
        Self::TotpBackupCodesRegenerated,
        Self::SessionRevoked,
        Self::OtherSessionsRevoked,
        Self::McpOauthAuthorized,
        Self::McpOauthTokenIssued,
        Self::McpOauthRefreshReuseDetected,
        Self::McpOauthCodeReuseDetected,
        Self::McpOauthTokenRevoked,
    ];

    /// The event types that indicate a possible attack rather than a user
    /// acting on their own account (JEF-354): a reused one-time credential
    /// means a copy of it exists somewhere it should not. Declared here,
    /// beside the full list, so the log level each type gets is decided once.
    pub const SUSPICIOUS: [Self; 2] =
        [Self::McpOauthRefreshReuseDetected, Self::McpOauthCodeReuseDetected];

    /// The value stored in `SecurityEvent.eventType` and sent over GraphQL.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::PasswordChanged => "password_changed",
            Self::EmailChanged => "email_changed",
            Self::TotpEnabled => "totp_enabled",
            Self::TotpDisabled => "totp_disabled",
            Self::TotpBackupCodesRegenerated => "totp_backup_codes_regenerated",
            Self::SessionRevoked => "session_revoked",
            Self::OtherSessionsRevoked => "other_sessions_revoked",
            Self::McpOauthAuthorized => "mcp_oauth_authorized",
            Self::McpOauthTokenIssued => "mcp_oauth_token_issued",
            Self::McpOauthRefreshReuseDetected => "mcp_oauth_refresh_reuse_detected",
            Self::McpOauthCodeReuseDetected => "mcp_oauth_code_reuse_detected",
            Self::McpOauthTokenRevoked => "mcp_oauth_token_revoked",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|event| event.as_str() == value)
    }

    pub fn is_suspicious(self) -> bool {
        Self::SUSPICIOUS.contains(&self)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SecurityEvent {
    pub id: String,
    pub user_id: String,
    pub event_type: SecurityEventType,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_type_round_trips_through_its_stored_value() {
        for event in SecurityEventType::ALL {
            assert_eq!(SecurityEventType::parse(event.as_str()), Some(event));
        }
    }

    #[test]
    fn an_unknown_event_type_does_not_parse() {
        assert_eq!(SecurityEventType::parse("password_guessed"), None);
    }

    #[test]
    fn only_the_reuse_detections_are_suspicious() {
        let suspicious: Vec<&str> = SecurityEventType::ALL
            .into_iter()
            .filter(|event| event.is_suspicious())
            .map(SecurityEventType::as_str)
            .collect();
        assert_eq!(
            suspicious,
            vec!["mcp_oauth_refresh_reuse_detected", "mcp_oauth_code_reuse_detected"]
        );
    }
}
