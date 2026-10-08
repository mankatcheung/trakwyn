//! The GraphQL schema.
//!
//! The contract is `apps/api-rust/schema.graphql`, the SDL printed from
//! `apps/api`'s Pothos schema; `tests/sdl_parity.rs` holds this schema to it.
//! Pothos makes every output field nullable unless told otherwise, so every
//! field here is an `Option`.
//!
//! Each domain module contributes a `*Query` and a `*Mutation`, merged below.

mod account;
pub mod enums;
mod notes;
mod session_auth_time;
pub mod support;
mod totp;
mod user;

use std::sync::Arc;

use async_graphql::{EmptySubscription, MergedObject, Schema};

use crate::http::container::Container;

#[derive(MergedObject, Default)]
pub struct Query(notes::NotesQuery, account::AccountQuery, totp::TotpQuery, user::UserQuery);

#[derive(MergedObject, Default)]
pub struct Mutation(
    notes::NotesMutation,
    account::AccountMutation,
    totp::TotpMutation,
    user::UserMutation,
);

pub type ApiSchema = Schema<Query, Mutation, EmptySubscription>;

pub fn build_schema(container: Arc<Container>) -> ApiSchema {
    Schema::build(Query::default(), Mutation::default(), EmptySubscription).data(container).finish()
}
