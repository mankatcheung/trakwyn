//! sqlx implementations of the repository ports.
//!
//! Tables and columns keep the quoted camelCase names Drizzle created, so
//! every identifier in a query here is double-quoted. Timestamps are bound
//! from `use_cases::clock::now()` rather than SQL `now()`, which would carry
//! microseconds the `timestamptz(3)` columns round away.

mod activity_log;
mod application;
mod backup_email_verification_token;
mod email_verification_token;
mod login_event;
mod note;
mod oauth_account;
mod password_reset_token;
mod security_event;
mod session;
pub mod support;
mod totp_backup_code;
mod user;

pub use activity_log::PgActivityLogRepository;
pub use application::PgApplicationRepository;
pub use backup_email_verification_token::PgBackupEmailVerificationTokenRepository;
pub use email_verification_token::PgEmailVerificationTokenRepository;
pub use login_event::PgLoginEventRepository;
pub use note::PgNoteRepository;
pub use oauth_account::PgOAuthAccountRepository;
pub use password_reset_token::PgPasswordResetTokenRepository;
pub use security_event::PgSecurityEventRepository;
pub use session::PgSessionRepository;
pub use totp_backup_code::PgTotpBackupCodeRepository;
pub use user::PgUserRepository;
