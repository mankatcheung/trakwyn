//! The GraphQL schema.
//!
//! The contract is `apps/api-rust/schema.graphql`, the SDL printed from
//! `apps/api`'s Pothos schema; `tests/sdl_parity.rs` holds this schema to it.
//! Pothos makes every output field nullable unless told otherwise, so every
//! field here is an `Option`.
//!
//! Each domain module contributes a `*Query` and a `*Mutation`, merged below.

mod ai_features;
mod company_briefing;
mod document_drafts;
mod llm_keys;
mod notes;
pub mod support;

use std::sync::Arc;

use async_graphql::{EmptySubscription, MergedObject, Schema};

use crate::http::container::Container;

#[derive(MergedObject, Default)]
pub struct Query(notes::NotesQuery, company_briefing::CompanyBriefingQuery, llm_keys::LlmKeysQuery);

#[derive(MergedObject, Default)]
pub struct Mutation(
    notes::NotesMutation,
    ai_features::AiFeaturesMutation,
    company_briefing::CompanyBriefingMutation,
    llm_keys::LlmKeysMutation,
);

pub type ApiSchema = Schema<Query, Mutation, EmptySubscription>;

pub fn build_schema(container: Arc<Container>) -> ApiSchema {
    Schema::build(Query::default(), Mutation::default(), EmptySubscription).data(container).finish()
}
