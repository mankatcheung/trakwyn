//! Use-case factories, one module per domain. Each adds an `impl Container`
//! block, so wiring a new domain touches only its own file.

mod ai_features;
mod api_tokens;
mod application_analytics;
mod applications;
mod auth;
mod chat;
mod contacts;
mod conversations;
mod cookie_consent;
mod digest;
mod documents;
mod interview_rounds;
pub mod llm;
mod mcp;
mod mcp_oauth;
mod notes;
mod notifications;
mod oauth;
mod offers;
mod profile;
mod push;
mod reminders;
mod sessions;
mod share_links;
mod user;
