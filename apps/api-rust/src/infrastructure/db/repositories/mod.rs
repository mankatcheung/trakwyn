//! sqlx implementations of the repository ports.
//!
//! Tables and columns keep the quoted camelCase names Drizzle created, so
//! every identifier in a query here is double-quoted. Timestamps are bound
//! from `use_cases::clock::now()` rather than SQL `now()`, which would carry
//! microseconds the `timestamptz(3)` columns round away.

mod activity_log;
mod application;
mod note;
pub mod support;

pub use activity_log::PgActivityLogRepository;
pub use application::PgApplicationRepository;
pub use note::PgNoteRepository;
