//! OAuth sign-in, TOTP, cron and extension settings (`GOOGLE_OAUTH_*`, `GITHUB_OAUTH_*`, `TOTP_ENCRYPTION_KEY`, `CRON_*`, `EXTENSION_OAUTH_IDS`, ...).

use super::{ConfigError, EnvLookup};

const GOOGLE_OAUTH_CLIENT_ID: &str = "GOOGLE_OAUTH_CLIENT_ID";
const GOOGLE_OAUTH_CLIENT_SECRET: &str = "GOOGLE_OAUTH_CLIENT_SECRET";
const GITHUB_OAUTH_CLIENT_ID: &str = "GITHUB_OAUTH_CLIENT_ID";
const GITHUB_OAUTH_CLIENT_SECRET: &str = "GITHUB_OAUTH_CLIENT_SECRET";
const OAUTH_PROVIDER_MODE: &str = "OAUTH_PROVIDER_MODE";
const TOTP_ENCRYPTION_KEY: &str = "TOTP_ENCRYPTION_KEY";
const EXTENSION_OAUTH_IDS: &str = "EXTENSION_OAUTH_IDS";
const API_ORIGIN: &str = "API_ORIGIN";
const CRON_SECRET: &str = "CRON_SECRET";
const DIGEST_ADMIN_SECRET: &str = "DIGEST_ADMIN_SECRET";
const CRON_INVOKER_SA: &str = "CRON_INVOKER_SA";
const NODE_ENV: &str = "NODE_ENV";

const NODE_ENV_PRODUCTION: &str = "production";
const OAUTH_PROVIDER_MODE_FAKE: &str = "fake";

/// The value `.env.example` ships for every secret. It is a string in a
/// public repository, so an encryption key still set to it protects nothing.
pub const PLACEHOLDER_SECRET: &str = "change-me-in-production";

/// The variable's value exactly as set, with only the empty string treated as
/// unset. Secrets and passphrases are read this way, not through
/// [`super::non_empty`]: `apps/api` neither trims them nor ignores a blank
/// one, and a passphrase that differed by whitespace would derive a different
/// key from the same `.env`.
pub(super) fn verbatim(get: EnvLookup<'_>, name: &str) -> Option<String> {
    get(name).filter(|value| !value.is_empty())
}

/// Whether `NODE_ENV` is exactly `production`.
pub(super) fn is_production(get: EnvLookup<'_>) -> bool {
    get(NODE_ENV).as_deref() == Some(NODE_ENV_PRODUCTION)
}

/// The passphrase an at-rest cipher derives its key from, or why there is
/// none: the variable is unset, or it is still the `.env.example` placeholder
/// while running in production.
///
/// `apps/api` applies this check when a value is first encrypted or
/// decrypted, not at startup, so the result is handed to the cipher rather
/// than failing `from_lookup`.
pub(super) fn encryption_passphrase(
    name: &'static str,
    value: Option<&str>,
    production: bool,
) -> Result<String, ConfigError> {
    let passphrase = value.ok_or(ConfigError::Missing(name))?;
    if passphrase == PLACEHOLDER_SECRET && production {
        return Err(ConfigError::Invalid {
            name,
            reason: "it is still the .env.example placeholder; set a real passphrase before \
                     running in production"
                .to_string(),
        });
    }
    Ok(passphrase.to_string())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OAuthClientCredentials {
    pub client_id: String,
    pub client_secret: String,
}

/// `OAUTH_PROVIDER_MODE`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OAuthProviderMode {
    Real,
    /// Same-origin stand-in provider, no live Google/GitHub calls: e2e and CI only.
    Fake,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthConfig {
    /// `None` unless both the client id and the client secret are set.
    pub google_oauth: Option<OAuthClientCredentials>,
    /// `None` unless both the client id and the client secret are set.
    pub github_oauth: Option<OAuthClientCredentials>,
    pub oauth_provider_mode: OAuthProviderMode,
    /// `TOTP_ENCRYPTION_KEY` as set. Read it through [`AuthConfig::totp_passphrase`].
    pub totp_encryption_key: Option<String>,
    /// `EXTENSION_OAUTH_IDS` as set: a comma-separated list, parsed (and
    /// filtered to well-formed ids) by `infrastructure::auth::parse_extension_oauth_ids`.
    pub extension_oauth_ids: Option<String>,
    /// `API_ORIGIN` as set. The cron routes compare it, untouched, with an
    /// OIDC token's audience; [`AuthConfig::issuer_origin`] is the normalised
    /// form the OAuth authorization server advertises.
    pub api_origin: Option<String>,
    pub cron_secret: Option<String>,
    pub digest_admin_secret: Option<String>,
    /// The service account Cloud Scheduler signs its OIDC tokens as.
    pub cron_invoker_sa: Option<String>,
    /// Whether `NODE_ENV` is `production`, which is when the placeholder key is refused.
    pub production: bool,
}

impl AuthConfig {
    pub fn from_lookup(get: EnvLookup<'_>) -> Result<Self, ConfigError> {
        let credentials = |id: &str, secret: &str| {
            Some(OAuthClientCredentials {
                client_id: verbatim(get, id)?,
                client_secret: verbatim(get, secret)?,
            })
        };

        Ok(Self {
            google_oauth: credentials(GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET),
            github_oauth: credentials(GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET),
            oauth_provider_mode: match get(OAUTH_PROVIDER_MODE).as_deref() {
                Some(OAUTH_PROVIDER_MODE_FAKE) => OAuthProviderMode::Fake,
                _ => OAuthProviderMode::Real,
            },
            totp_encryption_key: verbatim(get, TOTP_ENCRYPTION_KEY),
            extension_oauth_ids: verbatim(get, EXTENSION_OAUTH_IDS),
            api_origin: verbatim(get, API_ORIGIN),
            cron_secret: verbatim(get, CRON_SECRET),
            digest_admin_secret: verbatim(get, DIGEST_ADMIN_SECRET),
            cron_invoker_sa: verbatim(get, CRON_INVOKER_SA),
            production: is_production(get),
        })
    }

    /// The passphrase TOTP secrets are encrypted under, or why it cannot be used.
    pub fn totp_passphrase(&self) -> Result<String, ConfigError> {
        encryption_passphrase(
            TOTP_ENCRYPTION_KEY,
            self.totp_encryption_key.as_deref(),
            self.production,
        )
    }

    /// `API_ORIGIN` trimmed and without trailing slashes: the issuer the MCP
    /// OAuth authorization server advertises. `None` when it is unset or
    /// blank, which is the local-dev case where the request's own origin is used.
    pub fn issuer_origin(&self) -> Option<String> {
        let configured = self.api_origin.as_deref()?.trim();
        (!configured.is_empty()).then(|| configured.trim_end_matches('/').to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn config(pairs: &[(&str, &str)]) -> AuthConfig {
        let map: HashMap<String, String> =
            pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        AuthConfig::from_lookup(&|name| map.get(name).cloned()).unwrap()
    }

    #[test]
    fn everything_is_optional() {
        let config = config(&[]);

        assert_eq!(config.google_oauth, None);
        assert_eq!(config.github_oauth, None);
        assert_eq!(config.oauth_provider_mode, OAuthProviderMode::Real);
        assert_eq!(config.totp_encryption_key, None);
        assert_eq!(config.extension_oauth_ids, None);
        assert_eq!(config.api_origin, None);
        assert_eq!(config.cron_secret, None);
        assert_eq!(config.digest_admin_secret, None);
        assert_eq!(config.cron_invoker_sa, None);
        assert!(!config.production);
    }

    #[test]
    fn a_provider_is_configured_only_with_both_its_id_and_its_secret() {
        let config = config(&[
            ("GOOGLE_OAUTH_CLIENT_ID", "google-id"),
            ("GOOGLE_OAUTH_CLIENT_SECRET", "google-secret-not-real"),
            ("GITHUB_OAUTH_CLIENT_ID", "github-id"),
            ("GITHUB_OAUTH_CLIENT_SECRET", ""),
        ]);

        assert_eq!(
            config.google_oauth,
            Some(OAuthClientCredentials {
                client_id: "google-id".to_string(),
                client_secret: "google-secret-not-real".to_string(),
            })
        );
        assert_eq!(config.github_oauth, None);
    }

    #[test]
    fn only_the_exact_value_fake_selects_the_fake_provider() {
        assert_eq!(
            config(&[("OAUTH_PROVIDER_MODE", "fake")]).oauth_provider_mode,
            OAuthProviderMode::Fake
        );
        for other in ["real", "FAKE", " fake", ""] {
            assert_eq!(
                config(&[("OAUTH_PROVIDER_MODE", other)]).oauth_provider_mode,
                OAuthProviderMode::Real
            );
        }
    }

    #[test]
    fn reads_the_cron_and_extension_settings() {
        let config = config(&[
            ("EXTENSION_OAUTH_IDS", "abcdefghijklmnopabcdefghijklmnop"),
            ("API_ORIGIN", "https://api.example.com"),
            ("CRON_SECRET", "cron-secret-not-real"),
            ("DIGEST_ADMIN_SECRET", "digest-secret-not-real"),
            ("CRON_INVOKER_SA", "cron@project.iam.gserviceaccount.com"),
        ]);

        assert_eq!(config.extension_oauth_ids.as_deref(), Some("abcdefghijklmnopabcdefghijklmnop"));
        assert_eq!(config.api_origin.as_deref(), Some("https://api.example.com"));
        assert_eq!(config.cron_secret.as_deref(), Some("cron-secret-not-real"));
        assert_eq!(config.digest_admin_secret.as_deref(), Some("digest-secret-not-real"));
        assert_eq!(config.cron_invoker_sa.as_deref(), Some("cron@project.iam.gserviceaccount.com"));
    }

    #[test]
    fn a_passphrase_is_kept_byte_for_byte() {
        // Trimming it would derive a different key than apps/api does.
        let config = config(&[("TOTP_ENCRYPTION_KEY", "  spaced passphrase  ")]);
        assert_eq!(config.totp_passphrase().unwrap(), "  spaced passphrase  ");
    }

    #[test]
    fn a_missing_passphrase_is_reported_by_name() {
        let err = config(&[]).totp_passphrase().unwrap_err();
        assert!(matches!(err, ConfigError::Missing("TOTP_ENCRYPTION_KEY")));

        let err = config(&[("TOTP_ENCRYPTION_KEY", "")]).totp_passphrase().unwrap_err();
        assert!(matches!(err, ConfigError::Missing("TOTP_ENCRYPTION_KEY")));
    }

    #[test]
    fn refuses_the_placeholder_passphrase_in_production() {
        let config =
            config(&[("TOTP_ENCRYPTION_KEY", PLACEHOLDER_SECRET), ("NODE_ENV", "production")]);

        let err = config.totp_passphrase().unwrap_err();
        assert!(err.to_string().contains("TOTP_ENCRYPTION_KEY"));
        assert!(err.to_string().contains("placeholder"));
    }

    #[test]
    fn tolerates_the_placeholder_passphrase_outside_production() {
        for node_env in [Some("test"), Some("development"), None] {
            let mut pairs = vec![("TOTP_ENCRYPTION_KEY", PLACEHOLDER_SECRET)];
            pairs.extend(node_env.map(|value| ("NODE_ENV", value)));
            assert_eq!(config(&pairs).totp_passphrase().unwrap(), PLACEHOLDER_SECRET);
        }
    }

    #[test]
    fn the_issuer_origin_is_trimmed_and_has_no_trailing_slash() {
        let origin = |value: &str| config(&[("API_ORIGIN", value)]).issuer_origin();

        assert_eq!(origin("https://api.example.com").as_deref(), Some("https://api.example.com"));
        assert_eq!(
            origin(" https://api.example.com// ").as_deref(),
            Some("https://api.example.com")
        );
        assert_eq!(origin("   "), None);
        assert_eq!(config(&[]).issuer_origin(), None);
    }
}
