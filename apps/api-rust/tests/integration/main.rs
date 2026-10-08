//! Integration tests: one binary, so the crate links once.
//!
//! Everything except `sdl_parity` needs a Postgres server, named by
//! `TEST_DATABASE_URL` (see `common.rs`). `scripts/test.sh` starts a
//! throwaway one and runs the suite against it.

mod common;
mod document_drafts;
mod documents;
mod uploads;

mod api_tokens;
mod application_analytics;
mod applications;
mod applications_bulk;
mod applications_trash;
mod contacts;
mod conversations;
mod cookie_consent;
mod education;
mod http;
mod interview_rounds;
mod migrations;
mod notes;
mod notifications;
mod offers;
mod repositories;
mod repositories_applications;
mod repositories_auth;
mod repositories_content;
mod repositories_credentials;
mod sdl_parity;
mod share_links;
mod skills;
mod work_experience;
