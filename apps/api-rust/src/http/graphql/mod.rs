//! The GraphQL schema.
//!
//! The contract is `apps/api-rust/schema.graphql`, the SDL printed from
//! `apps/api`'s Pothos schema; `tests/sdl_parity.rs` holds this schema to it.
//! Pothos makes every output field nullable unless told otherwise, so every
//! field here is an `Option`.
//!
//! Each domain module contributes a `*Query` and a `*Mutation`, merged below.

mod activity_logs;
mod application_analytics;
mod application_mutations;
mod applications;
mod calendar;
mod contacts;
pub mod enums;
mod interview_rounds;
mod notes;
mod offers;
pub mod support;

use std::sync::Arc;

use async_graphql::{EmptySubscription, MergedObject, Schema};

use crate::http::container::Container;

#[derive(MergedObject, Default)]
pub struct Query(
    activity_logs::ActivityLogsQuery,
    application_analytics::ApplicationAnalyticsQuery,
    applications::ApplicationsQuery,
    calendar::CalendarQuery,
    contacts::ContactsQuery,
    interview_rounds::InterviewRoundsQuery,
    notes::NotesQuery,
    offers::OffersQuery,
);

#[derive(MergedObject, Default)]
pub struct Mutation(
    application_mutations::ApplicationsMutation,
    contacts::ContactsMutation,
    interview_rounds::InterviewRoundsMutation,
    notes::NotesMutation,
    offers::OffersMutation,
);

pub type ApiSchema = Schema<Query, Mutation, EmptySubscription>;

pub fn build_schema(container: Arc<Container>) -> ApiSchema {
    Schema::build(Query::default(), Mutation::default(), EmptySubscription).data(container).finish()
}
