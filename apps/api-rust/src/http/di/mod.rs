//! Use-case factories, one module per domain. Each adds an `impl Container`
//! block, so wiring a new domain touches only its own file.

mod api_tokens;
mod application_analytics;
mod applications;
mod auth;
mod contacts;
mod conversations;
mod cookie_consent;
mod interview_rounds;
mod notes;
mod notifications;
mod offers;
mod profile;
mod share_links;
