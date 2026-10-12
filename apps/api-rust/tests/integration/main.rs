//! Integration tests: one binary, so the crate links once.
//!
//! Everything except `sdl_parity` needs a Postgres server, named by
//! `TEST_DATABASE_URL` (see `common.rs`). `scripts/test.sh` starts a
//! throwaway one and runs the suite against it.

mod auth_support;
mod common;
mod document_drafts;
mod documents;
mod uploads;

mod account;
mod account_support;
mod admin_routes;
mod ai_features;
mod api_tokens;
mod application_analytics;
mod applications;
mod applications_bulk;
mod applications_trash;
mod auth;
mod auth_mobile;
mod chat;
mod chat_stream;
mod contacts;
mod conversations;
mod cookie_consent;
mod education;
mod http;
mod interview_rounds;
mod llm_keys;
mod mcp;
mod mcp_oauth_grants;
mod mcp_oauth_routes;
mod migrations;
mod notes;
mod notifications;
mod oauth_accounts;
mod oauth_routes;
mod offers;
mod push;
mod repositories;
mod repositories_applications;
mod repositories_auth;
mod repositories_content;
mod repositories_credentials;
mod sdl_parity;
mod security;
mod sessions;
mod share_links;
mod skills;
mod totp;
mod user;
mod work_experience;
