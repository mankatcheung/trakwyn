//! Dependency wiring: one implementation chosen for every port.
//!
//! Repositories and services are built once and shared (the `SINGLETON`s of
//! `apps/api`'s Awilix container). Use cases are built per call by the
//! factory methods in `http::di`, one module per domain (its `TRANSIENT`s).

use std::sync::Arc;

use crate::config::Config;
use crate::http::cookies::AuthCookies;
use crate::infrastructure::auth::JwtTokenService;
use crate::infrastructure::db::repositories as pg;
use crate::infrastructure::db::transaction_manager::PgTransactionManager;
use crate::infrastructure::db::Db;
use crate::infrastructure::session_blocklist::MemorySessionBlocklist;
use crate::use_cases::ids::{nanoid_generator, GenerateId};
use crate::use_cases::ports::transaction_manager::TransactionManager;
use crate::use_cases::ports::*;

pub struct Container {
    pub config: Arc<Config>,
    pub db: Db,
    pub auth_cookies: AuthCookies,
    pub generate_id: GenerateId,
    pub token_service: Arc<dyn TokenService>,
    pub session_blocklist: Arc<dyn SessionBlocklist>,
    pub transaction_manager: Arc<dyn TransactionManager>,

    pub activity_log_repository: Arc<dyn ActivityLogRepository>,
    pub api_token_repository: Arc<dyn ApiTokenRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub backup_email_verification_token_repository: Arc<dyn BackupEmailVerificationTokenRepository>,
    pub company_briefing_repository: Arc<dyn CompanyBriefingRepository>,
    pub contact_repository: Arc<dyn ContactRepository>,
    pub conversation_repository: Arc<dyn ConversationRepository>,
    pub cookie_consent_repository: Arc<dyn CookieConsentRepository>,
    pub document_draft_repository: Arc<dyn DocumentDraftRepository>,
    pub document_repository: Arc<dyn DocumentRepository>,
    pub education_repository: Arc<dyn EducationRepository>,
    pub email_verification_token_repository: Arc<dyn EmailVerificationTokenRepository>,
    pub interview_round_repository: Arc<dyn InterviewRoundRepository>,
    pub llm_api_key_repository: Arc<dyn LlmApiKeyRepository>,
    pub llm_usage_event_repository: Arc<dyn LlmUsageEventRepository>,
    pub login_event_repository: Arc<dyn LoginEventRepository>,
    pub mcp_oauth_authorization_code_repository: Arc<dyn McpOAuthAuthorizationCodeRepository>,
    pub mcp_oauth_client_repository: Arc<dyn McpOAuthClientRepository>,
    pub mcp_oauth_grant_repository: Arc<dyn McpOAuthGrantRepository>,
    pub mcp_oauth_refresh_token_repository: Arc<dyn McpOAuthRefreshTokenRepository>,
    pub mcp_oauth_token_repository: Arc<dyn McpOAuthTokenRepository>,
    pub message_repository: Arc<dyn MessageRepository>,
    pub note_repository: Arc<dyn NoteRepository>,
    pub notification_repository: Arc<dyn NotificationRepository>,
    pub oauth_account_repository: Arc<dyn OAuthAccountRepository>,
    pub offer_repository: Arc<dyn OfferRepository>,
    pub password_reset_token_repository: Arc<dyn PasswordResetTokenRepository>,
    pub push_subscription_repository: Arc<dyn PushSubscriptionRepository>,
    pub security_event_repository: Arc<dyn SecurityEventRepository>,
    pub session_repository: Arc<dyn SessionRepository>,
    pub share_link_repository: Arc<dyn ShareLinkRepository>,
    pub skill_repository: Arc<dyn SkillRepository>,
    pub totp_backup_code_repository: Arc<dyn TotpBackupCodeRepository>,
    pub user_repository: Arc<dyn UserRepository>,
    pub work_experience_repository: Arc<dyn WorkExperienceRepository>,
}

impl Container {
    pub fn new(config: Config, db: Db) -> Self {
        let repo = || db.clone();
        Self {
            auth_cookies: AuthCookies::new(&config),
            generate_id: nanoid_generator(),
            token_service: Arc::new(JwtTokenService::new(
                &config.jwt_secret,
                &config.jwt_refresh_secret,
            )),
            session_blocklist: Arc::new(MemorySessionBlocklist::default()),
            transaction_manager: Arc::new(PgTransactionManager::new(repo())),

            activity_log_repository: Arc::new(pg::PgActivityLogRepository::new(repo())),
            api_token_repository: Arc::new(pg::PgApiTokenRepository::new(repo())),
            application_repository: Arc::new(pg::PgApplicationRepository::new(repo())),
            backup_email_verification_token_repository: Arc::new(
                pg::PgBackupEmailVerificationTokenRepository::new(repo()),
            ),
            company_briefing_repository: Arc::new(pg::PgCompanyBriefingRepository::new(repo())),
            contact_repository: Arc::new(pg::PgContactRepository::new(repo())),
            conversation_repository: Arc::new(pg::PgConversationRepository::new(repo())),
            cookie_consent_repository: Arc::new(pg::PgCookieConsentRepository::new(repo())),
            document_draft_repository: Arc::new(pg::PgDocumentDraftRepository::new(repo())),
            document_repository: Arc::new(pg::PgDocumentRepository::new(repo())),
            education_repository: Arc::new(pg::PgEducationRepository::new(repo())),
            email_verification_token_repository: Arc::new(
                pg::PgEmailVerificationTokenRepository::new(repo()),
            ),
            interview_round_repository: Arc::new(pg::PgInterviewRoundRepository::new(repo())),
            llm_api_key_repository: Arc::new(pg::PgLlmApiKeyRepository::new(repo())),
            llm_usage_event_repository: Arc::new(pg::PgLlmUsageEventRepository::new(repo())),
            login_event_repository: Arc::new(pg::PgLoginEventRepository::new(repo())),
            mcp_oauth_authorization_code_repository: Arc::new(
                pg::PgMcpOAuthAuthorizationCodeRepository::new(repo()),
            ),
            mcp_oauth_client_repository: Arc::new(pg::PgMcpOAuthClientRepository::new(repo())),
            mcp_oauth_grant_repository: Arc::new(pg::PgMcpOAuthGrantRepository::new(repo())),
            mcp_oauth_refresh_token_repository: Arc::new(
                pg::PgMcpOAuthRefreshTokenRepository::new(repo()),
            ),
            mcp_oauth_token_repository: Arc::new(pg::PgMcpOAuthTokenRepository::new(repo())),
            message_repository: Arc::new(pg::PgMessageRepository::new(repo())),
            note_repository: Arc::new(pg::PgNoteRepository::new(repo())),
            notification_repository: Arc::new(pg::PgNotificationRepository::new(repo())),
            oauth_account_repository: Arc::new(pg::PgOAuthAccountRepository::new(repo())),
            offer_repository: Arc::new(pg::PgOfferRepository::new(repo())),
            password_reset_token_repository: Arc::new(pg::PgPasswordResetTokenRepository::new(
                repo(),
            )),
            push_subscription_repository: Arc::new(pg::PgPushSubscriptionRepository::new(repo())),
            security_event_repository: Arc::new(pg::PgSecurityEventRepository::new(repo())),
            session_repository: Arc::new(pg::PgSessionRepository::new(repo())),
            share_link_repository: Arc::new(pg::PgShareLinkRepository::new(repo())),
            skill_repository: Arc::new(pg::PgSkillRepository::new(repo())),
            totp_backup_code_repository: Arc::new(pg::PgTotpBackupCodeRepository::new(repo())),
            user_repository: Arc::new(pg::PgUserRepository::new(repo())),
            work_experience_repository: Arc::new(pg::PgWorkExperienceRepository::new(repo())),

            config: Arc::new(config),
            db,
        }
    }
}
