//! sqlx implementations of the repository ports.
//!
//! Tables and columns keep the quoted camelCase names Drizzle created, so
//! every identifier in a query here is double-quoted. Timestamps are bound
//! from `use_cases::clock::now()` rather than SQL `now()`, which would carry
//! microseconds the `timestamptz(3)` columns round away.

mod activity_log;
mod application;
mod company_briefing;
mod contact;
mod interview_round;
mod note;
mod offer;
pub mod support;

pub use activity_log::PgActivityLogRepository;
pub use application::PgApplicationRepository;
pub use company_briefing::PgCompanyBriefingRepository;
pub use contact::PgContactRepository;
pub use interview_round::PgInterviewRoundRepository;
pub use note::PgNoteRepository;
pub use offer::PgOfferRepository;
