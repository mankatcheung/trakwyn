//! Outbound email settings (`EMAIL_PROVIDER`, `BREVO_API_KEY`, `FROM_EMAIL`, `FROM_NAME`, `WEB_APP_ORIGIN`).

use super::{ConfigError, EnvLookup};

const EMAIL_PROVIDER_CONSOLE: &str = "console";
const DEFAULT_FROM_EMAIL: &str = "noreply@trakwyn.com";
const DEFAULT_FROM_NAME: &str = "Trakwyn";

/// `EMAIL_PROVIDER` values.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EmailProvider {
    Brevo,
    /// Logs instead of calling Brevo: local dev without a key, and CI.
    Console,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EmailConfig {
    /// `console` only when `EMAIL_PROVIDER` is exactly that; anything else,
    /// unset included, is Brevo.
    pub provider: EmailProvider,
    /// Empty when unset. Brevo then refuses every send, which is what
    /// `apps/api` does with a blank key.
    pub brevo_api_key: String,
    pub from_email: String,
    pub from_name: String,
    /// The web app's public origin, trimmed; `None` when unset or blank. The
    /// new-device alert refuses to send without it.
    pub web_app_origin: Option<String>,
}

impl EmailConfig {
    pub fn from_lookup(get: EnvLookup<'_>) -> Result<Self, ConfigError> {
        let provider = match get("EMAIL_PROVIDER").as_deref() {
            Some(EMAIL_PROVIDER_CONSOLE) => EmailProvider::Console,
            _ => EmailProvider::Brevo,
        };

        Ok(Self {
            provider,
            // Only an unset variable takes the default (`??` in `apps/api`):
            // one set to an empty string stays empty.
            brevo_api_key: get("BREVO_API_KEY").unwrap_or_default(),
            from_email: get("FROM_EMAIL").unwrap_or_else(|| DEFAULT_FROM_EMAIL.to_string()),
            from_name: get("FROM_NAME").unwrap_or_else(|| DEFAULT_FROM_NAME.to_string()),
            web_app_origin: get("WEB_APP_ORIGIN")
                .map(|origin| origin.trim().to_string())
                .filter(|origin| !origin.is_empty()),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn config(pairs: &[(&str, &str)]) -> EmailConfig {
        let map: HashMap<String, String> =
            pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        EmailConfig::from_lookup(&|name| map.get(name).cloned()).unwrap()
    }

    #[test]
    fn defaults_to_brevo_with_the_default_sender() {
        assert_eq!(
            config(&[]),
            EmailConfig {
                provider: EmailProvider::Brevo,
                brevo_api_key: String::new(),
                from_email: "noreply@trakwyn.com".to_string(),
                from_name: "Trakwyn".to_string(),
                web_app_origin: None,
            }
        );
    }

    #[test]
    fn reads_every_variable() {
        let config = config(&[
            ("EMAIL_PROVIDER", "console"),
            ("BREVO_API_KEY", "key"),
            ("FROM_EMAIL", "hello@custom.com"),
            ("FROM_NAME", "Custom Sender"),
            ("WEB_APP_ORIGIN", " https://www.trakwyn.com "),
        ]);

        assert_eq!(config.provider, EmailProvider::Console);
        assert_eq!(config.brevo_api_key, "key");
        assert_eq!(config.from_email, "hello@custom.com");
        assert_eq!(config.from_name, "Custom Sender");
        assert_eq!(config.web_app_origin.as_deref(), Some("https://www.trakwyn.com"));
    }

    #[test]
    fn an_unrecognised_provider_is_brevo() {
        assert_eq!(config(&[("EMAIL_PROVIDER", "Console")]).provider, EmailProvider::Brevo);
        assert_eq!(config(&[("EMAIL_PROVIDER", "smtp")]).provider, EmailProvider::Brevo);
    }

    #[test]
    fn a_blank_origin_is_no_origin() {
        assert_eq!(config(&[("WEB_APP_ORIGIN", "   ")]).web_app_origin, None);
        assert_eq!(config(&[("WEB_APP_ORIGIN", "")]).web_app_origin, None);
    }

    #[test]
    fn a_sender_set_to_an_empty_string_stays_empty() {
        assert_eq!(config(&[("FROM_EMAIL", "")]).from_email, "");
    }
}
