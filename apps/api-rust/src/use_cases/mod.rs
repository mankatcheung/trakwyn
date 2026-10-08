//! Business logic. Depends on `domain` and on the port traits in `ports`,
//! never on a driver, a framework or the transport.

pub mod activity_logs;
pub mod api_tokens;
pub mod applications;
pub mod auth;
pub mod calendar;
pub mod client_date;
pub mod clock;
pub mod company_briefing;
pub mod constants;
pub mod contacts;
pub mod conversations;
pub mod cookie_consent;
pub mod cover_letter;
pub mod documents;
pub mod education;
pub mod errors;
pub mod ids;
pub mod interview_rounds;
pub mod job_description;
pub mod jobs;
pub mod llm_keys;
pub mod login_events;
pub mod mcp_oauth;
pub mod notes;
pub mod notifications;
pub mod oauth;
pub mod offers;
pub mod ports;
pub mod resume;
pub mod resume_match;
pub mod secret_token;
pub mod security_events;
pub mod sessions;
pub mod share_links;
pub mod shared;
pub mod skills;
pub mod user;
pub mod work_experience;

#[cfg(test)]
pub mod test_support;
