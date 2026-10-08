use chrono::{DateTime, Utc};

/// A single visitor's cookie-consent decision, for audit purposes (JEF-211).
/// Anonymous by design: recorded before or without an account existing, so
/// there is no user id to attach it to. "Necessary" cookies are implicit;
/// `analytics_accepted` is the only category offered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CookieConsent {
    pub id: String,
    pub analytics_accepted: bool,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub consented_at: DateTime<Utc>,
}
