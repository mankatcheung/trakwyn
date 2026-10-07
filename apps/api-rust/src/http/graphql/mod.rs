//! The GraphQL schema.
//!
//! The contract is `apps/api-rust/schema.graphql`, the SDL printed from
//! `apps/api`'s Pothos schema; `tests/sdl_parity.rs` holds this schema to it.
//! Pothos makes every output field nullable unless told otherwise, so every
//! field here is an `Option`.
//!
//! Each domain module contributes a `*Query` and a `*Mutation`, merged below.

mod notes;
pub mod support;
mod api_tokens;
mod conversations;
mod cookie_consent;
mod education;
pub mod enums;
pub mod js_date;
mod notifications;
pub mod optional_input;
mod share_links;
mod skills;
mod work_experience;

use std::sync::Arc;

use async_graphql::{EmptySubscription, MergedObject, Schema};

use crate::http::container::Container;

#[derive(MergedObject, Default)]
pub struct Query(
    notes::NotesQuery,
    api_tokens::ApiTokensQuery,
    conversations::ConversationsQuery,
    education::EducationQuery,
    notifications::NotificationsQuery,
    share_links::ShareLinksQuery,
    skills::SkillsQuery,
    work_experience::WorkExperienceQuery,
);

#[derive(MergedObject, Default)]
pub struct Mutation(
    notes::NotesMutation,
    api_tokens::ApiTokensMutation,
    conversations::ConversationsMutation,
    cookie_consent::CookieConsentMutation,
    education::EducationMutation,
    notifications::NotificationsMutation,
    share_links::ShareLinksMutation,
    skills::SkillsMutation,
    work_experience::WorkExperienceMutation,
);

pub type ApiSchema = Schema<Query, Mutation, EmptySubscription>;

pub fn build_schema(container: Arc<Container>) -> ApiSchema {
    Schema::build(Query::default(), Mutation::default(), EmptySubscription).data(container).finish()
}
