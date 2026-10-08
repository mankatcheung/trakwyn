//! The GraphQL schema.
//!
//! The contract is `apps/api-rust/schema.graphql`, the SDL printed from
//! `apps/api`'s Pothos schema; `tests/sdl_parity.rs` holds this schema to it.
//! Pothos makes every output field nullable unless told otherwise, so every
//! field here is an `Option`.
//!
//! Each domain module contributes a `*Query` and a `*Mutation`, merged below.

mod document_drafts;
mod documents;
mod notes;
pub mod support;
mod upload_url_payload;

use std::sync::Arc;

use async_graphql::{EmptySubscription, MergedObject, Schema};

use crate::http::container::Container;

#[rustfmt::skip]
#[derive(MergedObject, Default)]
pub struct Query(
    document_drafts::DocumentDraftsQuery,
    documents::DocumentsQuery,
    notes::NotesQuery,
);

#[rustfmt::skip]
#[derive(MergedObject, Default)]
pub struct Mutation(
    document_drafts::DocumentDraftsMutation,
    documents::DocumentsMutation,
    notes::NotesMutation,
);

pub type ApiSchema = Schema<Query, Mutation, EmptySubscription>;

pub fn build_schema(container: Arc<Container>) -> ApiSchema {
    Schema::build(Query::default(), Mutation::default(), EmptySubscription).data(container).finish()
}
