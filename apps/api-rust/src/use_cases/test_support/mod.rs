//! In-memory doubles for the ports, one module per domain, for use-case
//! tests. Cross-cutting doubles (tokens, blocklist, ids) are in
//! `infrastructure`.

mod activity_logs;
mod applications;
mod documents_infra;
mod infrastructure;
mod logging;
mod notes;
mod push;
mod transactions;

pub use activity_logs::FakeActivityLogRepository;
pub use applications::{application_owned_by, FakeApplicationRepository};
pub use documents_infra::{ExtractCall, FakeDocumentTextExtractor, FakePdfRenderer};
pub use infrastructure::{sequential_ids, FakeSessionBlocklist, FakeTokenService};
pub use logging::{FakeLogger, LogLevel, LoggedLine};
pub use notes::FakeNoteRepository;
pub use push::{FakeExpoPushService, FakeWebPushService};
pub use transactions::FakeTransactionManager;
