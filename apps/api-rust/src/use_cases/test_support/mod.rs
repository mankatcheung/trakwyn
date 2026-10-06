//! In-memory doubles for the ports, one module per domain, for use-case
//! tests. Cross-cutting doubles (tokens, blocklist, ids) are in
//! `infrastructure`.

mod activity_logs;
mod applications;
mod infrastructure;
mod notes;

pub use activity_logs::FakeActivityLogRepository;
pub use applications::{application_owned_by, FakeApplicationRepository};
pub use infrastructure::{sequential_ids, FakeSessionBlocklist, FakeTokenService};
pub use notes::FakeNoteRepository;
