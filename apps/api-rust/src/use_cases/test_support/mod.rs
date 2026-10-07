//! In-memory doubles for the ports, one module per domain, for use-case
//! tests. Cross-cutting doubles (tokens, blocklist, ids) are in
//! `infrastructure`.

mod activity_logs;
mod applications;
mod company_briefings;
mod contacts;
mod infrastructure;
mod interview_rounds;
mod logging;
mod notes;
mod offers;
mod transactions;

pub use activity_logs::FakeActivityLogRepository;
pub use applications::{application_owned_by, FakeApplicationRepository};
pub use company_briefings::FakeCompanyBriefingRepository;
pub use contacts::FakeContactRepository;
pub use infrastructure::{sequential_ids, FakeSessionBlocklist, FakeTokenService};
pub use interview_rounds::FakeInterviewRoundRepository;
pub use logging::{FakeLogger, LogLevel, LoggedLine};
pub use notes::FakeNoteRepository;
pub use offers::FakeOfferRepository;
pub use transactions::FakeTransactionManager;
