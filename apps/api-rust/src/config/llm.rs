//! LLM settings (`LLM_API_KEY_ENCRYPTION_KEY`, `LLM_PROVIDER_MODE`).

use super::auth::{encryption_passphrase, is_production, verbatim};
use super::{ConfigError, EnvLookup};

const LLM_API_KEY_ENCRYPTION_KEY: &str = "LLM_API_KEY_ENCRYPTION_KEY";

/// The passphrase users' LLM API keys are encrypted under at rest.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LlmCipherConfig {
    /// `LLM_API_KEY_ENCRYPTION_KEY` as set. Read it through [`LlmCipherConfig::passphrase`].
    pub encryption_key: Option<String>,
    /// Whether `NODE_ENV` is `production`, which is when the placeholder key is refused.
    pub production: bool,
}

impl LlmCipherConfig {
    pub fn from_lookup(get: EnvLookup<'_>) -> Result<Self, ConfigError> {
        Ok(Self {
            encryption_key: verbatim(get, LLM_API_KEY_ENCRYPTION_KEY),
            production: is_production(get),
        })
    }

    /// The passphrase, or why it cannot be used: unset, or still the
    /// `.env.example` placeholder in production. `apps/api` raises this when a
    /// key is first encrypted or decrypted rather than at startup, so an API
    /// with no AI features configured still boots; hand the result to the
    /// cipher instead of failing on it.
    pub fn passphrase(&self) -> Result<String, ConfigError> {
        encryption_passphrase(
            LLM_API_KEY_ENCRYPTION_KEY,
            self.encryption_key.as_deref(),
            self.production,
        )
    }
}

#[cfg(test)]
mod cipher_config_tests {
    use super::*;
    use crate::config::auth::PLACEHOLDER_SECRET;
    use std::collections::HashMap;

    fn config(pairs: &[(&str, &str)]) -> LlmCipherConfig {
        let map: HashMap<String, String> =
            pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        LlmCipherConfig::from_lookup(&|name| map.get(name).cloned()).unwrap()
    }

    #[test]
    fn keeps_the_passphrase_byte_for_byte() {
        let config = config(&[("LLM_API_KEY_ENCRYPTION_KEY", " a passphrase ")]);
        assert_eq!(config.passphrase().unwrap(), " a passphrase ");
    }

    #[test]
    fn a_missing_passphrase_is_reported_by_name() {
        for pairs in [vec![], vec![("LLM_API_KEY_ENCRYPTION_KEY", "")]] {
            let err = config(&pairs).passphrase().unwrap_err();
            assert!(matches!(err, ConfigError::Missing("LLM_API_KEY_ENCRYPTION_KEY")));
        }
    }

    #[test]
    fn refuses_the_placeholder_in_production() {
        let config = config(&[
            ("LLM_API_KEY_ENCRYPTION_KEY", PLACEHOLDER_SECRET),
            ("NODE_ENV", "production"),
        ]);

        let err = config.passphrase().unwrap_err();
        assert!(err.to_string().contains("LLM_API_KEY_ENCRYPTION_KEY"));
        assert!(err.to_string().contains("placeholder"));
    }

    #[test]
    fn tolerates_the_placeholder_outside_production() {
        let config =
            config(&[("LLM_API_KEY_ENCRYPTION_KEY", PLACEHOLDER_SECRET), ("NODE_ENV", "test")]);
        assert_eq!(config.passphrase().unwrap(), PLACEHOLDER_SECRET);
    }

    #[test]
    fn a_real_passphrase_is_accepted_in_production() {
        let config = config(&[
            ("LLM_API_KEY_ENCRYPTION_KEY", "a-long-passphrase-that-is-not-real"),
            ("NODE_ENV", "production"),
        ]);
        assert_eq!(config.passphrase().unwrap(), "a-long-passphrase-that-is-not-real");
    }
}
