//! Business logic. Depends on `domain` and on the port traits in `ports`,
//! never on a driver, a framework or the transport.

pub mod activity_logs;
pub mod applications;
pub mod auth;
pub mod calendar;
pub mod clock;
pub mod constants;
pub mod errors;
pub mod ids;
pub mod jobs;
pub mod notes;
pub mod ports;
pub mod user;

#[cfg(test)]
pub mod test_support;
