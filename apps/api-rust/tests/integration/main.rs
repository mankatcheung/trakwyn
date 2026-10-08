//! Integration tests: one binary, so the crate links once.
//!
//! Everything except `sdl_parity` needs a Postgres server, named by
//! `TEST_DATABASE_URL` (see `common.rs`). `scripts/test.sh` starts a
//! throwaway one and runs the suite against it.

mod common;

mod api_tokens;
mod conversations;
mod cookie_consent;
mod education;
mod http;
mod migrations;
mod notes;
mod notifications;
mod repositories;
mod repositories_applications;
mod repositories_auth;
mod repositories_content;
mod repositories_credentials;
mod sdl_parity;
mod share_links;
mod skills;
mod work_experience;
