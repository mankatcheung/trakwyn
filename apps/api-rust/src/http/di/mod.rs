//! Use-case factories, one module per domain. Each adds an `impl Container`
//! block, so wiring a new domain touches only its own file.

mod api_tokens;
mod auth;
mod conversations;
mod cookie_consent;
mod notes;
mod notifications;
mod profile;
mod share_links;
