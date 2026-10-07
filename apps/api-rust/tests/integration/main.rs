//! Integration tests: one binary, so the crate links once.
//!
//! Everything except `sdl_parity` needs a Postgres server, named by
//! `TEST_DATABASE_URL` (see `common.rs`). `scripts/test.sh` starts a
//! throwaway one and runs the suite against it.

mod common;

mod contacts;
mod http;
mod interview_rounds;
mod migrations;
mod notes;
mod offers;
mod repositories;
mod repositories_applications;
mod repositories_auth;
mod repositories_content;
mod repositories_credentials;
mod sdl_parity;
