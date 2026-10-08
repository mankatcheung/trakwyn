//! Business logic. Depends on `domain` and on the port traits in `ports`,
//! never on a driver, a framework or the transport.

pub mod auth;
pub mod clock;
pub mod company_briefing;
pub mod constants;
pub mod cover_letter;
pub mod errors;
pub mod ids;
pub mod job_description;
pub mod jobs;
pub mod llm_keys;
pub mod notes;
pub mod ports;
pub mod resume;
pub mod resume_match;
pub mod shared;

#[cfg(test)]
pub mod test_support;
