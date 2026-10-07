//! In-memory doubles for the ports, one module per domain, for use-case
//! tests. Cross-cutting doubles (tokens, blocklist, ids) are in
//! `infrastructure`.

mod activity_logs;
mod applications;
mod devices;
mod emails;
mod infrastructure;
mod logging;
mod net;
mod notes;
mod storage;
mod transactions;

pub use activity_logs::FakeActivityLogRepository;
pub use applications::{application_owned_by, FakeApplicationRepository};
pub use devices::{FakeDeviceLabeler, FakeIpLocationResolver};
pub use emails::{FakeEmailService, SentEmail};
pub use infrastructure::{sequential_ids, FakeSessionBlocklist, FakeTokenService};
pub use logging::{FakeLogger, LogLevel, LoggedLine};
pub use net::FakeOutboundUrlPolicy;
pub use notes::FakeNoteRepository;
pub use storage::{FakeStorageProvider, StoredObject};
pub use transactions::FakeTransactionManager;
