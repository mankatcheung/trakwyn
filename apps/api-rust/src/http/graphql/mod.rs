//! The GraphQL schema.
//!
//! The contract is `apps/api-rust/schema.graphql`, the SDL printed from
//! `apps/api`'s Pothos schema; `tests/sdl_parity.rs` holds this schema to it.
//! Pothos makes every output field nullable unless told otherwise, so every
//! field here is an `Option`.
//!
//! Each domain module contributes a `*Query` and a `*Mutation`, merged below.

mod account;
mod activity_logs;
mod ai_features;
mod api_tokens;
mod application_analytics;
mod application_mutations;
mod applications;
mod auth;
pub mod auth_flows;
mod auth_mobile;
mod calendar;
mod company_briefing;
mod contacts;
mod conversations;
mod cookie_consent;
mod document_drafts;
mod documents;
mod education;
pub mod enums;
mod interview_rounds;
pub mod js_date;
mod llm_keys;
mod mcp_oauth_grants;
mod notes;
mod notifications;
mod oauth_accounts;
mod offers;
pub mod optional_input;
mod push;
mod security;
mod session_auth_time;
mod sessions;
mod share_links;
mod skills;
pub mod support;
mod totp;
mod upload_url_payload;
mod user;
mod work_experience;

use std::sync::Arc;

use async_graphql::{EmptySubscription, MergedObject, Schema};

use crate::http::container::Container;

#[derive(MergedObject, Default)]
pub struct Query(
    account::AccountQuery,
    activity_logs::ActivityLogsQuery,
    api_tokens::ApiTokensQuery,
    application_analytics::ApplicationAnalyticsQuery,
    applications::ApplicationsQuery,
    calendar::CalendarQuery,
    company_briefing::CompanyBriefingQuery,
    contacts::ContactsQuery,
    conversations::ConversationsQuery,
    document_drafts::DocumentDraftsQuery,
    documents::DocumentsQuery,
    education::EducationQuery,
    interview_rounds::InterviewRoundsQuery,
    llm_keys::LlmKeysQuery,
    mcp_oauth_grants::McpOAuthGrantsQuery,
    notes::NotesQuery,
    notifications::NotificationsQuery,
    oauth_accounts::OAuthAccountsQuery,
    offers::OffersQuery,
    security::SecurityQuery,
    sessions::SessionsQuery,
    share_links::ShareLinksQuery,
    skills::SkillsQuery,
    totp::TotpQuery,
    user::UserQuery,
    work_experience::WorkExperienceQuery,
);

#[derive(MergedObject, Default)]
pub struct Mutation(
    account::AccountMutation,
    ai_features::AiFeaturesMutation,
    api_tokens::ApiTokensMutation,
    application_mutations::ApplicationsMutation,
    auth::AuthMutation,
    auth_mobile::AuthMobileMutation,
    company_briefing::CompanyBriefingMutation,
    contacts::ContactsMutation,
    conversations::ConversationsMutation,
    cookie_consent::CookieConsentMutation,
    document_drafts::DocumentDraftsMutation,
    documents::DocumentsMutation,
    education::EducationMutation,
    interview_rounds::InterviewRoundsMutation,
    llm_keys::LlmKeysMutation,
    mcp_oauth_grants::McpOAuthGrantsMutation,
    notes::NotesMutation,
    notifications::NotificationsMutation,
    oauth_accounts::OAuthAccountsMutation,
    offers::OffersMutation,
    push::PushMutation,
    sessions::SessionsMutation,
    share_links::ShareLinksMutation,
    skills::SkillsMutation,
    totp::TotpMutation,
    user::UserMutation,
    work_experience::WorkExperienceMutation,
);

pub type ApiSchema = Schema<Query, Mutation, EmptySubscription>;

pub fn build_schema(container: Arc<Container>) -> ApiSchema {
    Schema::build(Query::default(), Mutation::default(), EmptySubscription).data(container).finish()
}
