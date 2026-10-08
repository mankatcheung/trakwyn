//! Who may trigger an `/admin/*` job.

use axum::http::header::AUTHORIZATION;
use axum::http::HeaderMap;
use subtle::ConstantTimeEq;

use crate::config::auth::AuthConfig;
use crate::http::constants::{cron_auth_events, BEARER_PREFIX};
use crate::use_cases::ports::logger::Logger;
use crate::use_cases::ports::oidc_token_verifier::OidcTokenVerifier;

/// Which of the two paths let a request in. Reported rather than discarded
/// because a production run that authenticated by shared secret means
/// something: Cloud Scheduler sends an OIDC token, so `secret` in production
/// is either a manual trigger or the scheduler's identity no longer verifying.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CronAuthMethod {
    Oidc,
    Secret,
}

impl CronAuthMethod {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Oidc => "oidc",
            Self::Secret => "secret",
        }
    }
}

/// Why a request was refused: it carried no bearer token at all, or carried
/// one that matched neither secret nor verified as the invoker. Which of the
/// checks a token failed is deliberately not said: that is the difference
/// between a log line and an oracle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Rejection {
    Missing,
    Invalid,
}

impl Rejection {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Missing => "missing",
            Self::Invalid => "invalid",
        }
    }
}

/// Whether any way of authorizing the route is configured. A route with none
/// answers 503 rather than a 401 no request could ever get past.
pub fn is_cron_trigger_configured(config: &AuthConfig, own_secret: Option<&str>) -> bool {
    own_secret.is_some() || config.cron_secret.is_some() || oidc_invoker(config).is_some()
}

/// The service account and audience Cloud Scheduler's OIDC token must carry.
fn oidc_invoker(config: &AuthConfig) -> Option<(&str, &str)> {
    Some((config.cron_invoker_sa.as_deref()?, config.api_origin.as_deref()?))
}

/// Compared in constant time, so the response time says nothing about how much
/// of a guess was right. `apps/api` compares with `===`.
fn matches_secret(token: &str, secret: Option<&str>) -> bool {
    secret.is_some_and(|secret| bool::from(token.as_bytes().ct_eq(secret.as_bytes())))
}

/// Shared auth check for the admin/cron-triggered routes. Returns how the
/// caller was authorized, or `None` if it was not. Accepts any of:
///
/// - a Google-signed OIDC ID token for the `CRON_INVOKER_SA` service account,
///   with `API_ORIGIN` as its audience: what the Cloud Scheduler jobs send.
///   No shared secret is involved, so nothing sensitive reaches Terraform
///   state;
/// - the route's own dedicated secret, for manual/external triggering;
/// - `CRON_SECRET`, kept as the manual-trigger path for every route.
///
/// A refusal is logged as `cron.auth.rejected`: it happens before the job's
/// summary line, so otherwise a scheduler whose token stopped verifying
/// leaves no trace at all. The token is never logged.
pub async fn authorize_cron_trigger(
    headers: &HeaderMap,
    config: &AuthConfig,
    own_secret: Option<&str>,
    verifier: &dyn OidcTokenVerifier,
    logger: &dyn Logger,
    job: &'static str,
) -> Option<CronAuthMethod> {
    let Some(token) = bearer_token(headers) else {
        return reject(logger, job, Rejection::Missing);
    };

    if matches_secret(token, own_secret) | matches_secret(token, config.cron_secret.as_deref()) {
        return Some(CronAuthMethod::Secret);
    }

    if is_scheduled_invoker(token, config, verifier).await {
        return Some(CronAuthMethod::Oidc);
    }
    reject(logger, job, Rejection::Invalid)
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers.get(AUTHORIZATION)?.to_str().ok()?.strip_prefix(BEARER_PREFIX)
}

async fn is_scheduled_invoker(
    token: &str,
    config: &AuthConfig,
    verifier: &dyn OidcTokenVerifier,
) -> bool {
    let Some((invoker, audience)) = oidc_invoker(config) else { return false };
    verifier.verify(token, audience).await.is_some_and(|identity| identity.email == invoker)
}

fn reject(logger: &dyn Logger, job: &'static str, reason: Rejection) -> Option<CronAuthMethod> {
    logger.warn(
        "Cron trigger rejected",
        None,
        &[
            ("event", cron_auth_events::REJECTED.into()),
            ("job", job.into()),
            ("reason", reason.as_str().into()),
        ],
    );
    None
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use async_trait::async_trait;

    use super::*;
    use crate::use_cases::ports::logger::LogValue;
    use crate::use_cases::ports::oidc_token_verifier::VerifiedOidcIdentity;
    use crate::use_cases::test_support::{FakeLogger, LogLevel};

    const INVOKER: &str = "cron-invoker@project.iam.gserviceaccount.com";
    const ORIGIN: &str = "https://api.example.com";

    /// Accepts exactly one token, for one audience and one identity.
    struct Verifier {
        token: &'static str,
        audience: &'static str,
        email: &'static str,
        seen_audiences: Mutex<Vec<String>>,
    }

    impl Verifier {
        fn google() -> Self {
            Self {
                token: "an-id-token",
                audience: ORIGIN,
                email: INVOKER,
                seen_audiences: Mutex::default(),
            }
        }
    }

    #[async_trait]
    impl OidcTokenVerifier for Verifier {
        async fn verify(&self, token: &str, audience: &str) -> Option<VerifiedOidcIdentity> {
            self.seen_audiences.lock().unwrap().push(audience.to_string());
            (token == self.token && audience == self.audience)
                .then(|| VerifiedOidcIdentity { email: self.email.to_string() })
        }
    }

    fn config(cron_secret: Option<&str>, digest_secret: Option<&str>, oidc: bool) -> AuthConfig {
        AuthConfig::from_lookup(&|name| match name {
            "CRON_SECRET" => cron_secret.map(str::to_string),
            "DIGEST_ADMIN_SECRET" => digest_secret.map(str::to_string),
            "CRON_INVOKER_SA" if oidc => Some(INVOKER.to_string()),
            "API_ORIGIN" if oidc => Some(ORIGIN.to_string()),
            _ => None,
        })
        .unwrap()
    }

    fn headers(authorization: Option<&str>) -> HeaderMap {
        let mut headers = HeaderMap::new();
        if let Some(value) = authorization {
            headers.insert(AUTHORIZATION, value.parse().unwrap());
        }
        headers
    }

    async fn authorize(
        authorization: Option<&str>,
        config: &AuthConfig,
        own: Option<&str>,
        logger: &FakeLogger,
    ) -> Option<CronAuthMethod> {
        authorize_cron_trigger(
            &headers(authorization),
            config,
            own,
            &Verifier::google(),
            logger,
            "reminders",
        )
        .await
    }

    fn rejection_reason(logger: &FakeLogger) -> String {
        let lines = logger.lines();
        assert_eq!(lines.len(), 1, "{lines:?}");
        assert_eq!(lines[0].level, LogLevel::Warn);
        assert_eq!(lines[0].message, "Cron trigger rejected");
        assert_eq!(lines[0].field("event"), Some(&LogValue::Str("cron.auth.rejected".into())));
        assert_eq!(lines[0].field("job"), Some(&LogValue::Str("reminders".into())));
        match lines[0].field("reason") {
            Some(LogValue::Str(reason)) => reason.clone(),
            other => panic!("no reason: {other:?}"),
        }
    }

    #[tokio::test]
    async fn accepts_a_verified_token_for_the_invoker() {
        let logger = FakeLogger::default();
        let method =
            authorize(Some("Bearer an-id-token"), &config(None, None, true), None, &logger).await;
        assert_eq!(method, Some(CronAuthMethod::Oidc));
        assert!(logger.lines().is_empty());
    }

    #[tokio::test]
    async fn refuses_a_token_for_another_service_account() {
        let logger = FakeLogger::default();
        let verifier = Verifier {
            email: "someone-else@project.iam.gserviceaccount.com",
            ..Verifier::google()
        };
        let method = authorize_cron_trigger(
            &headers(Some("Bearer an-id-token")),
            &config(None, None, true),
            None,
            &verifier,
            &logger,
            "reminders",
        )
        .await;
        assert_eq!(method, None);
        assert_eq!(rejection_reason(&logger), "invalid");
    }

    #[tokio::test]
    async fn refuses_every_token_when_the_invoker_or_audience_is_unset() {
        let logger = FakeLogger::default();
        let method =
            authorize(Some("Bearer an-id-token"), &config(None, None, false), None, &logger).await;
        assert_eq!(method, None);
        assert_eq!(rejection_reason(&logger), "invalid");
    }

    #[tokio::test]
    async fn verifies_against_the_configured_audience_untouched() {
        let logger = FakeLogger::default();
        let verifier = Verifier::google();
        authorize_cron_trigger(
            &headers(Some("Bearer whatever")),
            &config(None, None, true),
            None,
            &verifier,
            &logger,
            "reminders",
        )
        .await;
        assert_eq!(*verifier.seen_audiences.lock().unwrap(), vec![ORIGIN.to_string()]);
    }

    #[tokio::test]
    async fn accepts_cron_secret_and_the_routes_own_secret() {
        let logger = FakeLogger::default();
        let cfg = config(Some("the-cron-secret"), Some("the-digest-secret"), false);
        assert_eq!(
            authorize(
                Some("Bearer the-cron-secret"),
                &cfg,
                cfg.digest_admin_secret.as_deref(),
                &logger
            )
            .await,
            Some(CronAuthMethod::Secret)
        );
        assert_eq!(
            authorize(
                Some("Bearer the-digest-secret"),
                &cfg,
                cfg.digest_admin_secret.as_deref(),
                &logger
            )
            .await,
            Some(CronAuthMethod::Secret)
        );
        // The digest secret opens only the route that names it.
        assert_eq!(
            authorize(Some("Bearer the-digest-secret"), &cfg, cfg.cron_secret.as_deref(), &logger)
                .await,
            None
        );
    }

    #[tokio::test]
    async fn refuses_a_wrong_secret_and_says_invalid() {
        let logger = FakeLogger::default();
        let cfg = config(Some("the-cron-secret"), None, false);
        assert_eq!(authorize(Some("Bearer nope"), &cfg, None, &logger).await, None);
        assert_eq!(rejection_reason(&logger), "invalid");
    }

    #[tokio::test]
    async fn refuses_a_missing_or_non_bearer_header_and_says_missing() {
        for header in [None, Some("Basic abc"), Some("bearer lower"), Some("the-cron-secret")] {
            let logger = FakeLogger::default();
            let cfg = config(Some("the-cron-secret"), None, true);
            assert_eq!(authorize(header, &cfg, None, &logger).await, None, "{header:?}");
            assert_eq!(rejection_reason(&logger), "missing", "{header:?}");
        }
    }

    #[tokio::test]
    async fn an_empty_bearer_token_never_matches_an_unset_secret() {
        let logger = FakeLogger::default();
        assert_eq!(
            authorize(Some("Bearer "), &config(None, None, false), None, &logger).await,
            None
        );
    }

    #[test]
    fn is_configured_by_any_secret_or_the_invoker_pair() {
        assert!(!is_cron_trigger_configured(&config(None, None, false), None));
        assert!(is_cron_trigger_configured(&config(Some("s"), None, false), None));
        assert!(is_cron_trigger_configured(&config(None, Some("d"), false), Some("d")));
        assert!(is_cron_trigger_configured(&config(None, None, true), None));
    }

    #[test]
    fn the_digest_secret_alone_does_not_configure_another_route() {
        assert!(!is_cron_trigger_configured(&config(None, Some("d"), false), None));
    }
}
