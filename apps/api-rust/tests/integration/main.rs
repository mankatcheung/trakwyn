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
mod ai_features;
mod api_tokens;
mod application_analytics;
mod applications;
mod applications_bulk;
mod applications_trash;
mod auth;
mod auth_mobile;
mod contacts;
mod conversations;
mod cookie_consent;
mod education;
mod http;
mod interview_rounds;
mod llm_keys;
mod migrations;
mod notes;
mod notifications;
mod oauth_accounts;
mod offers;
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
