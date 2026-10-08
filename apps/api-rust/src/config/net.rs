//! Outbound-request settings (`OUTBOUND_URL_POLICY`).

use super::{ConfigError, EnvLookup, NodeEnv};

const OUTBOUND_URL_POLICY_STRICT: &str = "strict";
const OUTBOUND_URL_POLICY_PERMISSIVE: &str = "permissive";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NetConfig {
    /// Whether the outbound URL policy refuses private, loopback and
    /// link-local destinations.
    ///
    /// `OUTBOUND_URL_POLICY` decides when it is exactly `strict` or
    /// `permissive`; otherwise it is strict only in production. There the
    /// server's own network is exactly what an SSRF is after, while a
    /// developer's laptop or CI is theirs to point at (the fake LLM provider
    /// and a local Ollama both live on localhost). `permissive` exists for a
    /// self-hosted production instance that deliberately wants a local model
    /// reachable: an explicit choice to accept SSRF exposure, never the
    /// default.
    pub outbound_url_strict: bool,
}

impl NetConfig {
    pub fn from_lookup(get: EnvLookup<'_>, node_env: NodeEnv) -> Result<Self, ConfigError> {
        let outbound_url_strict = match get("OUTBOUND_URL_POLICY").as_deref() {
            Some(OUTBOUND_URL_POLICY_STRICT) => true,
            Some(OUTBOUND_URL_POLICY_PERMISSIVE) => false,
            _ => node_env == NodeEnv::Production,
        };
        Ok(Self { outbound_url_strict })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strict(policy: Option<&str>, node_env: NodeEnv) -> bool {
        let policy = policy.map(str::to_string);
        NetConfig::from_lookup(
            &|name| if name == "OUTBOUND_URL_POLICY" { policy.clone() } else { None },
            node_env,
        )
        .unwrap()
        .outbound_url_strict
    }

    #[test]
    fn defaults_to_strict_only_in_production() {
        assert!(strict(None, NodeEnv::Production));
        assert!(!strict(None, NodeEnv::Test));
        assert!(!strict(None, NodeEnv::Development));
    }

    #[test]
    fn an_explicit_policy_overrides_the_node_env_default() {
        assert!(!strict(Some("permissive"), NodeEnv::Production));
        assert!(strict(Some("strict"), NodeEnv::Development));
    }

    #[test]
    fn an_unrecognised_or_blank_policy_falls_back_to_the_node_env_default() {
        assert!(strict(Some("nonsense"), NodeEnv::Production));
        assert!(!strict(Some("nonsense"), NodeEnv::Development));
        assert!(strict(Some(""), NodeEnv::Production));
        assert!(!strict(Some("Strict"), NodeEnv::Development));
    }
}
