//! Outbound email: Brevo in production, a logging stand-in for local dev and CI.

mod brevo_email_service;
mod console_email_service;
pub mod templates;

pub use brevo_email_service::{BrevoApiError, BrevoEmailService, BREVO_API_URL};
pub use console_email_service::ConsoleEmailService;
