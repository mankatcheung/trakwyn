//! Integration tests: one binary, so the crate links once.
//!
//! Everything except `sdl_parity` needs a Postgres server, named by
//! `TEST_DATABASE_URL` (see `common.rs`). `scripts/test.sh` starts a
//! throwaway one and runs the suite against it.

mod common;

mod http;
mod migrations;
mod notes;
mod repositories;
mod repositories_auth;
mod repositories_content;
mod repositories_credentials;
mod sdl_parity;
