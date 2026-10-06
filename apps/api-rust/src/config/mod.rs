//! Process configuration, read from the environment once at startup.
//!
//! The variable names are the ones `apps/api` reads, so one `.env` serves
//! either implementation.
//!
//! Each area of infrastructure has its own module here holding a config
//! struct with a `from_lookup(get)` constructor, so nothing outside `config`
//! reads an environment variable.

pub mod auth;
pub mod cache;
pub mod email;
pub mod llm;
pub mod net;
pub mod push;
pub mod storage;

use std::env;

/// A name → value source for configuration: the process environment in
/// production, a map in tests.
pub type EnvLookup<'a> = &'a dyn Fn(&str) -> Option<String>;

/// The variable's value, with a blank one treated as unset.
pub fn non_empty(get: EnvLookup<'_>, name: &str) -> Option<String> {
    get(name).filter(|value| !value.trim().is_empty())
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("{0} must be set")]
    Missing(&'static str),
    #[error("{name} is invalid: {reason}")]
    Invalid { name: &'static str, reason: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeEnv {
    Development,
    Production,
    Test,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub node_env: NodeEnv,
    pub database_url: String,
    pub jwt_secret: String,
    pub jwt_refresh_secret: String,
    /// Exact origins allowed to make credentialed requests (`CORS_ORIGIN`, comma-separated).
    pub cors_origins: Vec<String>,
    /// Shared `Domain` for the auth cookies, e.g. `.trakwyn.com`. `None` means host-only.
    pub cookie_domain: Option<String>,
}

const DEFAULT_PORT: u16 = 3001;
const DEFAULT_CORS_ORIGIN: &str = "http://localhost:3000";

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_lookup(|name| env::var(name).ok())
    }

    /// Builds the config from any name → value source, so tests never touch
    /// the process environment.
    pub fn from_lookup(get: impl Fn(&str) -> Option<String>) -> Result<Self, ConfigError> {
        let non_empty = |name: &str| get(name).filter(|value| !value.trim().is_empty());
        let required = |name: &'static str| non_empty(name).ok_or(ConfigError::Missing(name));

        let port = match non_empty("PORT") {
            None => DEFAULT_PORT,
            Some(raw) => raw.parse().map_err(|_| ConfigError::Invalid {
                name: "PORT",
                reason: format!("{raw:?} is not a port number"),
            })?,
        };

        let node_env = match non_empty("NODE_ENV").as_deref() {
            Some("production") => NodeEnv::Production,
            Some("test") => NodeEnv::Test,
            _ => NodeEnv::Development,
        };

        let database_url = required("DATABASE_URL")?;
        if !database_url.starts_with("postgres://") && !database_url.starts_with("postgresql://") {
            // `apps/api` also accepts `pglite:` (an in-process Postgres); there
            // is no Rust equivalent, so this implementation needs a real server.
            return Err(ConfigError::Invalid {
                name: "DATABASE_URL",
                reason: "expected a postgres:// URL (pglite: is only supported by apps/api)"
                    .to_string(),
            });
        }

        let cors_origins = non_empty("CORS_ORIGIN")
            .unwrap_or_else(|| DEFAULT_CORS_ORIGIN.to_string())
            .split(',')
            .map(|origin| origin.trim().to_string())
            .filter(|origin| !origin.is_empty())
            .collect();

        Ok(Self {
            port,
            node_env,
            database_url,
            jwt_secret: required("JWT_SECRET")?,
            jwt_refresh_secret: required("JWT_REFRESH_SECRET")?,
            cors_origins,
            cookie_domain: non_empty("COOKIE_DOMAIN"),
        })
    }

    pub fn is_production(&self) -> bool {
        self.node_env == NodeEnv::Production
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn lookup(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let map: HashMap<String, String> =
            pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        move |name| map.get(name).cloned()
    }

    const BASE: [(&str, &str); 3] = [
        ("DATABASE_URL", "postgres://localhost/trakwyn"),
        ("JWT_SECRET", "a"),
        ("JWT_REFRESH_SECRET", "b"),
    ];

    #[test]
    fn applies_defaults() {
        let config = Config::from_lookup(lookup(&BASE)).unwrap();
        assert_eq!(config.port, 3001);
        assert_eq!(config.node_env, NodeEnv::Development);
        assert_eq!(config.cors_origins, vec!["http://localhost:3000"]);
        assert_eq!(config.cookie_domain, None);
    }

    #[test]
    fn splits_cors_origins() {
        let mut pairs = BASE.to_vec();
        pairs.push(("CORS_ORIGIN", "https://a.example, https://b.example"));
        let config = Config::from_lookup(lookup(&pairs)).unwrap();
        assert_eq!(config.cors_origins, vec!["https://a.example", "https://b.example"]);
    }

    #[test]
    fn requires_the_jwt_secrets() {
        let err = Config::from_lookup(lookup(&BASE[..2])).unwrap_err();
        assert!(matches!(err, ConfigError::Missing("JWT_REFRESH_SECRET")));
    }

    #[test]
    fn treats_a_blank_value_as_unset() {
        let mut pairs = BASE.to_vec();
        pairs.push(("COOKIE_DOMAIN", "  "));
        assert_eq!(Config::from_lookup(lookup(&pairs)).unwrap().cookie_domain, None);
    }

    #[test]
    fn rejects_a_pglite_url() {
        let pairs = [("DATABASE_URL", "pglite:./.pglite"), BASE[1], BASE[2]];
        let err = Config::from_lookup(lookup(&pairs)).unwrap_err();
        assert!(matches!(err, ConfigError::Invalid { name: "DATABASE_URL", .. }));
    }
}
