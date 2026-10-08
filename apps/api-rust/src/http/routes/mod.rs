//! HTTP routes outside the GraphQL endpoint.

pub mod admin;
pub mod chat_stream;
pub mod cron_auth;
pub mod digest;
pub mod fake_llm_completions;
pub mod fake_oauth_consent;
pub mod health;
pub mod mcp;
pub mod mcp_oauth;
pub mod mcp_oauth_helpers;
pub mod oauth;
pub mod oauth_error_slug;
pub mod oauth_platform;
pub mod push_notifications;
pub mod reminders;
pub mod run_scheduled_job;
pub mod trash_purge;
pub mod uploads;
