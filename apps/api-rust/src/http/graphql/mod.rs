//! The GraphQL schema.
//!
//! The contract is `apps/api-rust/schema.graphql`, the SDL printed from
//! `apps/api`'s Pothos schema; `tests/sdl_parity.rs` holds this schema to it.
//! Pothos makes every output field nullable unless told otherwise, so every
//! field here is an `Option`.
//!
//! Each domain module contributes a `*Query` and a `*Mutation`, merged below.

mod activity_logs;
mod api_tokens;
mod application_analytics;
mod application_mutations;
mod applications;
mod auth;
pub mod auth_flows;
mod auth_mobile;
mod calendar;
mod contacts;
mod conversations;
mod cookie_consent;
mod document_drafts;
mod documents;
mod education;
pub mod enums;
mod interview_rounds;
pub mod js_date;
mod notes;
mod notifications;
mod oauth_accounts;
mod offers;
pub mod optional_input;
mod security;
mod sessions;
mod share_links;
mod skills;
pub mod support;
mod upload_url_payload;
mod work_experience;

use std::sync::Arc;

use async_graphql::{EmptySubscription, MergedObject, Schema};

use crate::http::container::Container;

#[derive(MergedObject, Default)]
pub struct Query(
    activity_logs::ActivityLogsQuery,
    api_tokens::ApiTokensQuery,
    application_analytics::ApplicationAnalyticsQuery,
    applications::ApplicationsQuery,
    calendar::CalendarQuery,
    contacts::ContactsQuery,
    conversations::ConversationsQuery,
    document_drafts::DocumentDraftsQuery,
    documents::DocumentsQuery,
    education::EducationQuery,
    interview_rounds::InterviewRoundsQuery,
    notes::NotesQuery,
    notifications::NotificationsQuery,
    oauth_accounts::OAuthAccountsQuery,
    offers::OffersQuery,
    security::SecurityQuery,
    sessions::SessionsQuery,
    share_links::ShareLinksQuery,
    skills::SkillsQuery,
    work_experience::WorkExperienceQuery,
);

#[derive(MergedObject, Default)]
pub struct Mutation(
    api_tokens::ApiTokensMutation,
    application_mutations::ApplicationsMutation,
    auth::AuthMutation,
    auth_mobile::AuthMobileMutation,
    contacts::ContactsMutation,
    conversations::ConversationsMutation,
    cookie_consent::CookieConsentMutation,
    document_drafts::DocumentDraftsMutation,
    documents::DocumentsMutation,
    education::EducationMutation,
    interview_rounds::InterviewRoundsMutation,
    notes::NotesMutation,
    notifications::NotificationsMutation,
    oauth_accounts::OAuthAccountsMutation,
    offers::OffersMutation,
    sessions::SessionsMutation,
    share_links::ShareLinksMutation,
    skills::SkillsMutation,
    work_experience::WorkExperienceMutation,
);

pub type ApiSchema = Schema<Query, Mutation, EmptySubscription>;

pub fn build_schema(container: Arc<Container>) -> ApiSchema {
    Schema::build(Query::default(), Mutation::default(), EmptySubscription).data(container).finish()
}
