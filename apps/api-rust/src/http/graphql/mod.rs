//! The GraphQL schema.
//!
//! The contract is `apps/api-rust/schema.graphql`, the SDL printed from
//! `apps/api`'s Pothos schema; `tests/sdl_parity.rs` holds this schema to it.
//! Pothos makes every output field nullable unless told otherwise, so every
//! field here is an `Option`.
//!
//! Each domain module contributes a `*Query` and a `*Mutation`, merged below.

mod auth;
pub mod auth_flows;
mod auth_mobile;
mod enums;
mod notes;
mod oauth_accounts;
mod security;
mod sessions;
pub mod support;

use std::sync::Arc;

use async_graphql::{EmptySubscription, MergedObject, Schema};

use crate::http::container::Container;

#[derive(MergedObject, Default)]
pub struct Query(
    notes::NotesQuery,
    oauth_accounts::OAuthAccountsQuery,
    security::SecurityQuery,
    sessions::SessionsQuery,
);

#[derive(MergedObject, Default)]
pub struct Mutation(
    auth::AuthMutation,
    auth_mobile::AuthMobileMutation,
    notes::NotesMutation,
    oauth_accounts::OAuthAccountsMutation,
    sessions::SessionsMutation,
);

pub type ApiSchema = Schema<Query, Mutation, EmptySubscription>;

pub fn build_schema(container: Arc<Container>) -> ApiSchema {
    Schema::build(Query::default(), Mutation::default(), EmptySubscription).data(container).finish()
}
