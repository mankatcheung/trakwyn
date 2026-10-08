//! sqlx implementations of the repository ports.
//!
//! Tables and columns keep the quoted camelCase names Drizzle created, so
//! every identifier in a query here is double-quoted. Timestamps are bound
//! from `use_cases::clock::now()` rather than SQL `now()`, which would carry
//! microseconds the `timestamptz(3)` columns round away.

mod activity_log;
mod api_token;
mod application;
mod backup_email_verification_token;
mod cached_mcp_oauth_token;
mod company_briefing;
mod contact;
mod email_verification_token;
mod interview_round;
mod llm_api_key;
mod llm_usage_event;
mod login_event;
mod mcp_oauth_authorization_code;
mod mcp_oauth_client;
mod mcp_oauth_grant;
mod mcp_oauth_refresh_token;
mod mcp_oauth_token;
mod note;
mod oauth_account;
mod offer;
mod password_reset_token;
mod security_event;
mod session;
mod share_link;
pub mod support;
mod totp_backup_code;
mod user;

pub use activity_log::PgActivityLogRepository;
pub use api_token::PgApiTokenRepository;
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
mod conversation;
mod cookie_consent;
mod document;
mod document_draft;
mod education;
mod message;
mod notification;
mod push_subscription;
mod skill;
mod work_experience;

pub use cached_mcp_oauth_token::CachedMcpOAuthTokenRepository;
pub use company_briefing::PgCompanyBriefingRepository;
pub use contact::PgContactRepository;
pub use conversation::PgConversationRepository;
pub use cookie_consent::PgCookieConsentRepository;
pub use document::PgDocumentRepository;
pub use document_draft::PgDocumentDraftRepository;
pub use education::PgEducationRepository;
pub use interview_round::PgInterviewRoundRepository;
pub use llm_api_key::PgLlmApiKeyRepository;
pub use llm_usage_event::PgLlmUsageEventRepository;
pub use mcp_oauth_authorization_code::PgMcpOAuthAuthorizationCodeRepository;
pub use mcp_oauth_client::PgMcpOAuthClientRepository;
pub use mcp_oauth_grant::PgMcpOAuthGrantRepository;
pub use mcp_oauth_refresh_token::PgMcpOAuthRefreshTokenRepository;
pub use mcp_oauth_token::PgMcpOAuthTokenRepository;
pub use message::PgMessageRepository;
pub use notification::PgNotificationRepository;
pub use offer::PgOfferRepository;
pub use push_subscription::PgPushSubscriptionRepository;
pub use share_link::PgShareLinkRepository;
pub use skill::PgSkillRepository;
pub use work_experience::PgWorkExperienceRepository;
mod blocklisting_session;
mod logging_security_event;
pub use blocklisting_session::BlocklistingSessionRepository;
pub use logging_security_event::LoggingSecurityEventRepository;
