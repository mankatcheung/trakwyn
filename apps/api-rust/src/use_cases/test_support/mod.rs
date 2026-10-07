//! In-memory doubles for the ports, one module per domain, for use-case
//! tests. Cross-cutting doubles (tokens, blocklist, ids) are in
//! `infrastructure`.

mod activity_logs;
mod applications;
mod backup_email_verification_tokens;
mod email_verification_tokens;
mod infrastructure;
mod logging;
mod login_events;
mod notes;
mod oauth_accounts;
mod password_reset_tokens;
mod security_events;
mod sessions;
mod totp_backup_codes;
mod transactions;
mod users;

pub use activity_logs::FakeActivityLogRepository;
pub use applications::{application_owned_by, FakeApplicationRepository};
pub use backup_email_verification_tokens::FakeBackupEmailVerificationTokenRepository;
pub use email_verification_tokens::FakeEmailVerificationTokenRepository;
pub use infrastructure::{sequential_ids, FakeSessionBlocklist, FakeTokenService};
pub use logging::{FakeLogger, LogLevel, LoggedLine};
pub use login_events::FakeLoginEventRepository;
pub use notes::FakeNoteRepository;
pub use oauth_accounts::FakeOAuthAccountRepository;
pub use password_reset_tokens::FakePasswordResetTokenRepository;
pub use security_events::FakeSecurityEventRepository;
pub use sessions::{session_for, FakeSessionRepository};
pub use totp_backup_codes::FakeTotpBackupCodeRepository;
pub use transactions::FakeTransactionManager;
pub use users::{user_with_email, FakeUserRepository};
