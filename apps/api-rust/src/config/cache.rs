//! Cache, rate-limiter and session-blocklist store settings (`CACHE_PROVIDER`, `UPSTASH_REDIS_REST_*`).

use std::fmt;

use super::{non_empty, ConfigError, EnvLookup};

const CACHE_PROVIDER: &str = "CACHE_PROVIDER";
const UPSTASH_REDIS_REST_URL: &str = "UPSTASH_REDIS_REST_URL";
const UPSTASH_REDIS_REST_TOKEN: &str = "UPSTASH_REDIS_REST_TOKEN";

const PROVIDER_REDIS: &str = "redis";

/// Where the cache, the rate limiters and the session blocklist keep their
/// state. One toggle covers all three: each is only coherent across
/// instances when it is in Redis.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CacheProvider {
    /// In process. The default, for local dev and tests.
    Memory,
    Redis,
}

/// How to reach the Upstash Redis database over its REST API.
#[derive(Clone, PartialEq, Eq)]
pub struct UpstashConfig {
    pub rest_url: String,
    pub rest_token: String,
}

impl fmt::Debug for UpstashConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("UpstashConfig")
            .field("rest_url", &self.rest_url)
            .field("rest_token", &"[redacted]")
            .finish()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CacheConfig {
    pub provider: CacheProvider,
    /// Present exactly when `provider` is `Redis`.
    pub upstash: Option<UpstashConfig>,
}

impl CacheConfig {
    /// Any `CACHE_PROVIDER` other than exactly `redis` means in-process, and
    /// then the Upstash variables are not read.
    ///
    /// With `redis`, both Upstash variables are required. The cache and rate
    /// limiting underlie nearly every request, so a misconfiguration fails
    /// at startup rather than silently on first use.
    pub fn from_lookup(get: EnvLookup<'_>) -> Result<Self, ConfigError> {
        if get(CACHE_PROVIDER).as_deref() != Some(PROVIDER_REDIS) {
            return Ok(Self { provider: CacheProvider::Memory, upstash: None });
        }

        match (non_empty(get, UPSTASH_REDIS_REST_URL), non_empty(get, UPSTASH_REDIS_REST_TOKEN)) {
            (Some(rest_url), Some(rest_token)) => Ok(Self {
                provider: CacheProvider::Redis,
                upstash: Some(UpstashConfig { rest_url, rest_token }),
            }),
            _ => Err(ConfigError::Invalid {
                name: CACHE_PROVIDER,
                reason: format!(
                    "{CACHE_PROVIDER}={PROVIDER_REDIS} requires both {UPSTASH_REDIS_REST_URL} and {UPSTASH_REDIS_REST_TOKEN}"
                ),
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    fn config(pairs: &[(&str, &str)]) -> Result<CacheConfig, ConfigError> {
        let map: HashMap<String, String> =
            pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        CacheConfig::from_lookup(&|name| map.get(name).cloned())
    }

    const URL: (&str, &str) = ("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    const TOKEN: (&str, &str) = ("UPSTASH_REDIS_REST_TOKEN", "secret-token");

    #[test]
    fn defaults_to_the_in_process_stores() {
        let config = config(&[]).unwrap();
        assert_eq!(config.provider, CacheProvider::Memory);
        assert_eq!(config.upstash, None);
    }

    #[test]
    fn treats_any_value_but_redis_as_memory_and_ignores_the_upstash_variables() {
        for provider in ["memory", "", "Redis", "redis ", "valkey"] {
            let config = config(&[("CACHE_PROVIDER", provider), URL, TOKEN]).unwrap();
            assert_eq!(config.provider, CacheProvider::Memory, "{provider:?}");
            assert_eq!(config.upstash, None);
        }
    }

    #[test]
    fn reads_the_upstash_variables_when_the_provider_is_redis() {
        let config = config(&[("CACHE_PROVIDER", "redis"), URL, TOKEN]).unwrap();

        assert_eq!(config.provider, CacheProvider::Redis);
        assert_eq!(
            config.upstash,
            Some(UpstashConfig {
                rest_url: "https://example.upstash.io".to_string(),
                rest_token: "secret-token".to_string(),
            })
        );
    }

    #[test]
    fn fails_at_startup_when_redis_is_chosen_without_both_upstash_variables() {
        let incomplete: [&[(&str, &str)]; 4] = [
            &[("CACHE_PROVIDER", "redis")],
            &[("CACHE_PROVIDER", "redis"), URL],
            &[("CACHE_PROVIDER", "redis"), TOKEN],
            &[("CACHE_PROVIDER", "redis"), URL, ("UPSTASH_REDIS_REST_TOKEN", "")],
        ];
        for pairs in incomplete {
            let err = config(pairs).unwrap_err();
            assert!(matches!(err, ConfigError::Invalid { name: "CACHE_PROVIDER", .. }));
            assert_eq!(
                err.to_string(),
                "CACHE_PROVIDER is invalid: CACHE_PROVIDER=redis requires both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN"
            );
        }
    }

    #[test]
    fn keeps_the_token_out_of_debug_output() {
        let config = config(&[("CACHE_PROVIDER", "redis"), URL, TOKEN]).unwrap();

        let printed = format!("{config:?}");

        assert!(!printed.contains("secret-token"));
        assert!(printed.contains("https://example.upstash.io"));
    }
}
