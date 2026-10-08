//! Trakwyn API, Rust implementation.
//!
//! The layers mirror `apps/api` (Clean Architecture), and the dependency rule
//! is the same: `domain` imports nothing, `use_cases` imports `domain` only,
//! `infrastructure` implements the ports `use_cases` declares, and `http` is
//! the only layer that knows there is a transport.

// The GraphQL root is one merged object over every domain's resolvers; the
// generated resolver futures nest deeper than the default limit allows.
#![recursion_limit = "512"]

pub mod config;
pub mod domain;
pub mod http;
pub mod infrastructure;
pub mod use_cases;
