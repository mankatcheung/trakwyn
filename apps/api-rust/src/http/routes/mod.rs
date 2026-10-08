//! HTTP routes outside the GraphQL endpoint.

pub mod admin;
pub mod cron_auth;
pub mod digest;
pub mod fake_llm_completions;
pub mod health;
pub mod mcp_oauth;
pub mod mcp_oauth_helpers;
pub mod push_notifications;
pub mod reminders;
pub mod run_scheduled_job;
pub mod trash_purge;
pub mod uploads;
