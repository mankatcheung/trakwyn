//! The interfaces `use_cases` needs from the outside world. `infrastructure`
//! implements them; `http::container` picks the implementation.

pub mod activity_log_repository;
pub mod application_repository;
pub mod company_briefing_repository;
pub mod contact_repository;
pub mod interview_round_repository;
pub mod logger;
pub mod note_repository;
pub mod offer_repository;
pub mod outbound_url_policy;
pub mod session_blocklist;
pub mod token_service;
pub mod transaction_manager;

pub use activity_log_repository::{ActivityLogRepository, AppendActivityLogData};
pub use application_repository::*;
pub use company_briefing_repository::{CompanyBriefingRepository, UpsertCompanyBriefingData};
pub use contact_repository::{ContactRepository, CreateContactData, UpdateContactData};
pub use interview_round_repository::*;
pub use note_repository::{CreateNoteData, NoteRepository};
pub use offer_repository::{CreateOfferData, OfferRepository, UpdateOfferData};
pub use session_blocklist::SessionBlocklist;
pub use token_service::{AccessClaims, RefreshClaims, TokenPair, TokenService};
