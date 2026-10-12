//! The non-repository singletons: which implementation each infrastructure
//! port gets, chosen from configuration the way `apps/api`'s
//! `http/di/infrastructure.ts` and `rate-limiters.ts` choose it.

use std::sync::Arc;

use crate::config::auth::OAuthProviderMode;
use crate::config::email::EmailProvider;
use crate::config::storage::StorageProviderKind;
use crate::config::Config;
use crate::domain::oauth_account::OAuthProviderName;
use crate::http::constants::rate_limit;
use crate::infrastructure::auth as auth_infra;
use crate::infrastructure::cache::{
    Cache, InstrumentedCache, MemoryCache, RedisCache, RedisClient, UpstashRedisClient,
};
use crate::infrastructure::device::{DeviceLabelService, IpLocationService, IP_LOCATION_API_URL};
use crate::infrastructure::documents::DocumentTextExtractor as PdfAndDocxTextExtractor;
use crate::infrastructure::email::{BrevoEmailService, ConsoleEmailService, BREVO_API_URL};
use crate::infrastructure::job_description::fetch_job_posting_source_resolver::FetchJobPostingSourceResolver;
use crate::infrastructure::llm::fetch_with_retry::LlmTransport;
use crate::infrastructure::llm::AesGcmLlmApiKeyCipher;
use crate::infrastructure::net::ResolvingOutboundUrlPolicy;
use crate::infrastructure::observability::{NoopMetrics, StructuredLogger};
use crate::infrastructure::pdf::PdfDocumentRenderer;
use crate::infrastructure::push::{
    ExpoPushService as ExpoPushClient, WebPushService as VapidWebPushService,
};
use crate::infrastructure::rate_limit::{
    InstrumentedRateLimiter, MemoryRateLimiter, RedisRateLimiter,
};
use crate::infrastructure::session_blocklist::{MemorySessionBlocklist, RedisSessionBlocklist};
use crate::infrastructure::storage::{
    HttpRemoteFileFetcher, LocalStorageProvider, VercelBlobStorageProvider, VERCEL_BLOB_API_URL,
};
use crate::use_cases::ports::device_labeler::DeviceLabeler;
use crate::use_cases::ports::document_text_extractor::DocumentTextExtractor;
use crate::use_cases::ports::email_service::EmailService;
use crate::use_cases::ports::expo_push_service::ExpoPushService;
use crate::use_cases::ports::ip_location_resolver::IpLocationResolver;
use crate::use_cases::ports::job_posting_source_resolver::JobPostingSourceResolver;
use crate::use_cases::ports::llm_api_key_cipher::LlmApiKeyCipher;
use crate::use_cases::ports::logger::Logger;
use crate::use_cases::ports::metrics::Metrics;
use crate::use_cases::ports::mobile_oauth_handoff_service::MobileOAuthHandoffService;
use crate::use_cases::ports::oauth_provider::OAuthProvider;
use crate::use_cases::ports::oauth_provider_registry::OAuthProviderRegistry;
use crate::use_cases::ports::oidc_token_verifier::OidcTokenVerifier;
use crate::use_cases::ports::outbound_url_policy::OutboundUrlPolicy;
use crate::use_cases::ports::pdf_renderer::PdfRenderer;
use crate::use_cases::ports::qr_code_renderer::QrCodeRenderer;
use crate::use_cases::ports::rate_limiter::{RateLimit, RateLimiter};
use crate::use_cases::ports::remote_file_fetcher::RemoteFileFetcher;
use crate::use_cases::ports::storage_provider::StorageProvider;
use crate::use_cases::ports::totp_provider::TotpProvider;
use crate::use_cases::ports::web_push_service::WebPushService;
use crate::use_cases::ports::SessionBlocklist;

pub type BoxError = Box<dyn std::error::Error + Send + Sync>;

/// One limiter per abuse-prone action. The names are `apps/api`'s DI names,
/// which is what a rejection is logged and counted under.
pub struct RateLimiters {
    pub password_reset: Arc<dyn RateLimiter>,
    pub totp: Arc<dyn RateLimiter>,
    pub chat: Arc<dyn RateLimiter>,
    pub generate_resume: Arc<dyn RateLimiter>,
    pub generate_cover_letter: Arc<dyn RateLimiter>,
    pub parse_job_description: Arc<dyn RateLimiter>,
    pub compute_resume_match_score: Arc<dyn RateLimiter>,
    pub generate_company_briefing: Arc<dyn RateLimiter>,
    pub test_llm_api_key: Arc<dyn RateLimiter>,
    pub update_password: Arc<dyn RateLimiter>,
    pub request_email_change: Arc<dyn RateLimiter>,
    pub request_add_backup_email: Arc<dyn RateLimiter>,
    pub remove_backup_email: Arc<dyn RateLimiter>,
    pub backup_email_recovery: Arc<dyn RateLimiter>,
    pub mcp_oauth_registration: Arc<dyn RateLimiter>,
    pub mcp_oauth_authorization: Arc<dyn RateLimiter>,
    pub mcp_oauth_token: Arc<dyn RateLimiter>,
    pub mcp_oauth_revocation: Arc<dyn RateLimiter>,
}

pub struct Services {
    pub logger: Arc<dyn Logger>,
    pub metrics: Arc<dyn Metrics>,
    pub cache: Arc<dyn Cache>,
    pub session_blocklist: Arc<dyn SessionBlocklist>,
    pub rate_limiters: RateLimiters,
    pub storage_provider: Arc<dyn StorageProvider>,
    /// The concrete local provider, for the dev upload and read-back routes;
    /// `None` when objects live in Vercel Blob.
    pub local_storage: Option<Arc<LocalStorageProvider>>,
    pub email_service: Arc<dyn EmailService>,
    pub device_labeler: Arc<dyn DeviceLabeler>,
    pub ip_location_resolver: Arc<dyn IpLocationResolver>,
    pub outbound_url_policy: Arc<dyn OutboundUrlPolicy>,
    pub totp_provider: Arc<dyn TotpProvider>,
    pub oauth_provider_registry: Arc<dyn OAuthProviderRegistry>,
    pub oauth_state_service: Arc<auth_infra::OAuthStateService>,
    pub mobile_oauth_handoff_service: Arc<auth_infra::HmacMobileOAuthHandoffService>,
    pub mobile_oauth_handoff: Arc<dyn MobileOAuthHandoffService>,
    pub mcp_oauth_consent_service: Arc<auth_infra::McpOAuthConsentService>,
    pub oidc_token_verifier: Arc<dyn OidcTokenVerifier>,
    pub llm_api_key_cipher: Arc<dyn LlmApiKeyCipher>,
    pub llm_transport: LlmTransport,
    pub qr_code_renderer: Arc<dyn QrCodeRenderer>,
    pub remote_file_fetcher: Arc<dyn RemoteFileFetcher>,
    pub document_text_extractor: Arc<dyn DocumentTextExtractor>,
    pub pdf_renderer: Arc<dyn PdfRenderer>,
    pub job_posting_source_resolver: Arc<dyn JobPostingSourceResolver>,
    pub web_push_service: Arc<dyn WebPushService>,
    pub expo_push_service: Arc<dyn ExpoPushService>,
    /// The web app's origin, for links in emails: the first `CORS_ORIGIN`.
    pub web_app_origin: String,
}

/// Selects Redis or the in-process limiter with the same toggle the cache
/// uses, sharing its client, and wraps it so a rejection is logged and counted.
fn limiter(
    name: &'static str,
    limit: RateLimit,
    redis: Option<&Arc<dyn RedisClient>>,
    logger: &Arc<dyn Logger>,
    metrics: &Arc<dyn Metrics>,
) -> Arc<dyn RateLimiter> {
    let inner: Arc<dyn RateLimiter> = match redis {
        Some(redis) => {
            Arc::new(RedisRateLimiter::new(redis.clone(), limit, metrics.clone(), logger.clone()))
        }
        None => Arc::new(MemoryRateLimiter::new(limit)),
    };
    Arc::new(InstrumentedRateLimiter::new(inner, name, logger.clone(), metrics.clone()))
}

fn rate_limiters(
    redis: Option<&Arc<dyn RedisClient>>,
    logger: &Arc<dyn Logger>,
    metrics: &Arc<dyn Metrics>,
) -> RateLimiters {
    let build = |name, limit| limiter(name, limit, redis, logger, metrics);
    RateLimiters {
        password_reset: build("passwordResetRateLimiter", rate_limit::PASSWORD_RESET_REQUEST),
        totp: build("totpRateLimiter", rate_limit::TOTP_VERIFICATION),
        chat: build("chatRateLimiter", rate_limit::CHAT_MESSAGE),
        generate_resume: build("generateResumeRateLimiter", rate_limit::GENERATE_RESUME),
        generate_cover_letter: build(
            "generateCoverLetterRateLimiter",
            rate_limit::GENERATE_COVER_LETTER,
        ),
        parse_job_description: build(
            "parseJobDescriptionRateLimiter",
            rate_limit::PARSE_JOB_DESCRIPTION,
        ),
        compute_resume_match_score: build(
            "computeResumeMatchScoreRateLimiter",
            rate_limit::COMPUTE_RESUME_MATCH_SCORE,
        ),
        generate_company_briefing: build(
            "generateCompanyBriefingRateLimiter",
            rate_limit::GENERATE_COMPANY_BRIEFING,
        ),
        test_llm_api_key: build("testLlmApiKeyRateLimiter", rate_limit::TEST_LLM_API_KEY),
        update_password: build("updatePasswordRateLimiter", rate_limit::UPDATE_PASSWORD),
        request_email_change: build(
            "requestEmailChangeRateLimiter",
            rate_limit::REQUEST_EMAIL_CHANGE,
        ),
        request_add_backup_email: build(
            "requestAddBackupEmailRateLimiter",
            rate_limit::REQUEST_ADD_BACKUP_EMAIL,
        ),
        remove_backup_email: build("removeBackupEmailRateLimiter", rate_limit::REMOVE_BACKUP_EMAIL),
        backup_email_recovery: build(
            "backupEmailRecoveryRateLimiter",
            rate_limit::BACKUP_EMAIL_RECOVERY,
        ),
        mcp_oauth_registration: build(
            "mcpOAuthRegistrationRateLimiter",
            rate_limit::MCP_OAUTH_REGISTRATION,
        ),
        mcp_oauth_authorization: build(
            "mcpOAuthAuthorizationRateLimiter",
            rate_limit::MCP_OAUTH_AUTHORIZATION,
        ),
        mcp_oauth_token: build("mcpOAuthTokenRateLimiter", rate_limit::MCP_OAUTH_TOKEN),
        mcp_oauth_revocation: build(
            "mcpOAuthRevocationRateLimiter",
            rate_limit::MCP_OAUTH_REVOCATION,
        ),
    }
}

fn oauth_provider(
    name: OAuthProviderName,
    config: &Config,
    http: &reqwest::Client,
) -> Arc<dyn OAuthProvider> {
    if config.auth.oauth_provider_mode == OAuthProviderMode::Fake {
        return Arc::new(auth_infra::FakeOAuthProvider::new(name));
    }
    // An unconfigured provider is still constructed, with blank credentials:
    // the start route answers "not configured" before it is ever used.
    let credentials = match name {
        OAuthProviderName::Google => config.auth.google_oauth.as_ref(),
        OAuthProviderName::Github => config.auth.github_oauth.as_ref(),
    };
    let (id, secret) = credentials
        .map(|credentials| (credentials.client_id.clone(), credentials.client_secret.clone()))
        .unwrap_or_default();
    match name {
        OAuthProviderName::Google => Arc::new(auth_infra::GoogleOAuthProvider::new(
            id,
            secret,
            auth_infra::GoogleOAuthEndpoints::default(),
            http.clone(),
        )),
        OAuthProviderName::Github => Arc::new(auth_infra::GitHubOAuthProvider::new(
            id,
            secret,
            auth_infra::GitHubOAuthEndpoints::default(),
            http.clone(),
        )),
    }
}

impl Services {
    pub fn new(config: &Config) -> Result<Self, BoxError> {
        let logger: Arc<dyn Logger> = Arc::new(StructuredLogger::stdout(config.is_production()));
        let metrics: Arc<dyn Metrics> = Arc::new(NoopMetrics);
        let http = reqwest::Client::new();

        // One Redis client shared by the cache, the limiters and the
        // blocklist, as in `apps/api`.
        let redis: Option<Arc<dyn RedisClient>> = match &config.cache.upstash {
            Some(upstash) => {
                Some(Arc::new(UpstashRedisClient::new(&upstash.rest_url, &upstash.rest_token)?))
            }
            None => None,
        };

        let inner_cache: Arc<dyn Cache> = match &redis {
            Some(redis) => {
                Arc::new(RedisCache::new(redis.clone(), metrics.clone(), logger.clone()))
            }
            None => Arc::new(MemoryCache::default()),
        };
        let session_blocklist: Arc<dyn SessionBlocklist> = match &redis {
            Some(redis) => {
                Arc::new(RedisSessionBlocklist::new(redis.clone(), metrics.clone(), logger.clone()))
            }
            None => Arc::new(MemorySessionBlocklist::default()),
        };

        let (storage_provider, local_storage): (Arc<dyn StorageProvider>, _) =
            match config.storage.provider {
                StorageProviderKind::VercelBlob => (
                    Arc::new(VercelBlobStorageProvider::new(
                        http.clone(),
                        VERCEL_BLOB_API_URL,
                        config.storage.blob_public_read_write_token.clone(),
                    )),
                    None,
                ),
                StorageProviderKind::Local => {
                    let local = Arc::new(LocalStorageProvider::new(
                        LocalStorageProvider::default_upload_dir()?,
                        config.port,
                    ));
                    (local.clone(), Some(local))
                }
            };

        let email_service: Arc<dyn EmailService> = match config.email.provider {
            EmailProvider::Console => Arc::new(ConsoleEmailService::new()),
            EmailProvider::Brevo => Arc::new(BrevoEmailService::new(
                http.clone(),
                BREVO_API_URL,
                config.email.brevo_api_key.clone(),
                config.email.from_email.clone(),
                config.email.from_name.clone(),
                config.email.web_app_origin.clone(),
            )),
        };

        let outbound_url_policy: Arc<dyn OutboundUrlPolicy> = Arc::new(
            ResolvingOutboundUrlPolicy::new(config.net.outbound_url_strict, Some(logger.clone())),
        );

        let oauth_http = auth_infra::oauth_http_client()?;
        let mobile_oauth_handoff_service =
            Arc::new(auth_infra::HmacMobileOAuthHandoffService::new(config.jwt_secret.clone()));

        Ok(Self {
            cache: Arc::new(InstrumentedCache::new(inner_cache, metrics.clone())),
            session_blocklist,
            rate_limiters: rate_limiters(redis.as_ref(), &logger, &metrics),
            storage_provider,
            local_storage,
            email_service,
            device_labeler: Arc::new(DeviceLabelService::new()),
            ip_location_resolver: Arc::new(IpLocationService::new(
                http.clone(),
                IP_LOCATION_API_URL,
            )),
            totp_provider: Arc::new(auth_infra::Rfc6238TotpProvider::from_passphrase(
                config.auth.totp_passphrase(),
            )),
            oauth_provider_registry: Arc::new(auth_infra::StaticOAuthProviderRegistry::new(
                oauth_provider(OAuthProviderName::Google, config, &oauth_http),
                oauth_provider(OAuthProviderName::Github, config, &oauth_http),
            )),
            oauth_state_service: Arc::new(auth_infra::OAuthStateService::new(
                config.jwt_secret.clone(),
            )),
            mobile_oauth_handoff: mobile_oauth_handoff_service.clone(),
            mobile_oauth_handoff_service,
            mcp_oauth_consent_service: Arc::new(auth_infra::McpOAuthConsentService::new(
                config.jwt_secret.clone(),
            )),
            oidc_token_verifier: Arc::new(auth_infra::GoogleOidcTokenVerifier::new(
                auth_infra::GOOGLE_JWKS_URL,
                http.clone(),
                Some(logger.clone()),
            )),
            llm_api_key_cipher: Arc::new(AesGcmLlmApiKeyCipher::from_passphrase(
                config.llm_cipher.passphrase(),
            )),
            llm_transport: LlmTransport::new()?,
            qr_code_renderer: Arc::new(auth_infra::PngQrCodeRenderer),
            remote_file_fetcher: Arc::new(HttpRemoteFileFetcher::default()),
            document_text_extractor: Arc::new(PdfAndDocxTextExtractor::new()),
            pdf_renderer: Arc::new(PdfDocumentRenderer::new()),
            job_posting_source_resolver: Arc::new(FetchJobPostingSourceResolver::new(
                outbound_url_policy.clone(),
            )?),
            outbound_url_policy,
            web_push_service: Arc::new(VapidWebPushService::new(&config.push)),
            expo_push_service: Arc::new(ExpoPushClient::default()),
            web_app_origin: config
                .cors_origins
                .first()
                .cloned()
                .unwrap_or_else(|| "http://localhost:3000".to_string()),
            logger,
            metrics,
        })
    }
}
