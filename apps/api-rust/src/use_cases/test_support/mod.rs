//! In-memory doubles for the ports, one module per domain, for use-case
//! tests. Cross-cutting doubles (tokens, blocklist, ids) are in
//! `infrastructure`.

mod activity_logs;
mod api_tokens;
mod applications;
mod infrastructure;
mod llm_api_keys;
mod llm_usage_events;
mod logging;
mod mcp_oauth;
mod notes;
mod share_links;
mod transactions;

pub use activity_logs::FakeActivityLogRepository;
pub use api_tokens::FakeApiTokenRepository;
pub use applications::{application_owned_by, FakeApplicationRepository};
pub use infrastructure::{sequential_ids, FakeSessionBlocklist, FakeTokenService};
pub use llm_api_keys::FakeLlmApiKeyRepository;
pub use llm_usage_events::FakeLlmUsageEventRepository;
pub use logging::{FakeLogger, LogLevel, LoggedLine};
pub use mcp_oauth::*;
pub use notes::FakeNoteRepository;
pub use share_links::FakeShareLinkRepository;
pub use transactions::FakeTransactionManager;
