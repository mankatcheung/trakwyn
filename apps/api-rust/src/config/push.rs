//! Push notification settings (`VAPID_*`).

use super::{ConfigError, EnvLookup};

const VAPID_PUBLIC_KEY: &str = "VAPID_PUBLIC_KEY";
const VAPID_PRIVATE_KEY: &str = "VAPID_PRIVATE_KEY";
const VAPID_SUBJECT: &str = "VAPID_SUBJECT";

const DEFAULT_VAPID_SUBJECT: &str = "mailto:noreply@trakwyn.com";

/// The VAPID identity browser push is sent under.
///
/// The keys are the URL-safe base64 pair `npx web-push generate-vapid-keys`
/// prints. Leaving either blank disables web push: the service still starts,
/// and every send fails with "VAPID keys not configured".
#[derive(Clone, PartialEq, Eq)]
pub struct PushConfig {
    /// Empty when unset.
    pub vapid_public_key: String,
    /// Empty when unset.
    pub vapid_private_key: String,
    /// A `mailto:` or `https:` contact for the push service operator.
    pub vapid_subject: String,
}

impl PushConfig {
    /// Never fails: nothing here is required, and the values are only
    /// checked when a push is actually sent, as `apps/api` does.
    ///
    /// The values are taken as they are, not trimmed. Only an *unset*
    /// `VAPID_SUBJECT` falls back to the default; one set to an empty string
    /// stays empty and fails each send with the VAPID subject error.
    pub fn from_lookup(get: EnvLookup<'_>) -> Result<Self, ConfigError> {
        Ok(Self {
            vapid_public_key: get(VAPID_PUBLIC_KEY).unwrap_or_default(),
            vapid_private_key: get(VAPID_PRIVATE_KEY).unwrap_or_default(),
            vapid_subject: get(VAPID_SUBJECT).unwrap_or_else(|| DEFAULT_VAPID_SUBJECT.to_string()),
        })
    }

    /// Whether both keys are present, i.e. web push is switched on.
    pub fn is_configured(&self) -> bool {
        !self.vapid_public_key.is_empty() && !self.vapid_private_key.is_empty()
    }
}

/// Hand-written so the private key cannot end up in a log line.
impl std::fmt::Debug for PushConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PushConfig")
            .field("vapid_public_key", &self.vapid_public_key)
            .field("vapid_private_key", &"<redacted>")
            .field("vapid_subject", &self.vapid_subject)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn config(pairs: &[(&str, &str)]) -> PushConfig {
        let map: HashMap<String, String> =
            pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        PushConfig::from_lookup(&|name| map.get(name).cloned()).unwrap()
    }

    #[test]
    fn is_disabled_with_nothing_set() {
        let config = config(&[]);
        assert_eq!(config.vapid_public_key, "");
        assert_eq!(config.vapid_private_key, "");
        assert_eq!(config.vapid_subject, "mailto:noreply@trakwyn.com");
        assert!(!config.is_configured());
    }

    #[test]
    fn is_disabled_when_the_keys_are_left_blank() {
        let config = config(&[("VAPID_PUBLIC_KEY", ""), ("VAPID_PRIVATE_KEY", "")]);
        assert!(!config.is_configured());
    }

    #[test]
    fn needs_both_keys() {
        assert!(!config(&[("VAPID_PUBLIC_KEY", "pub")]).is_configured());
        assert!(!config(&[("VAPID_PRIVATE_KEY", "priv")]).is_configured());
    }

    #[test]
    fn reads_the_keys_and_subject() {
        let config = config(&[
            ("VAPID_PUBLIC_KEY", "pub"),
            ("VAPID_PRIVATE_KEY", "priv"),
            ("VAPID_SUBJECT", "https://trakwyn.com/contact"),
        ]);
        assert!(config.is_configured());
        assert_eq!(config.vapid_public_key, "pub");
        assert_eq!(config.vapid_private_key, "priv");
        assert_eq!(config.vapid_subject, "https://trakwyn.com/contact");
    }

    #[test]
    fn keeps_a_subject_set_to_the_empty_string() {
        assert_eq!(config(&[("VAPID_SUBJECT", "")]).vapid_subject, "");
    }

    #[test]
    fn debug_output_omits_the_private_key() {
        let config = config(&[("VAPID_PUBLIC_KEY", "pub"), ("VAPID_PRIVATE_KEY", "s3cret")]);
        assert!(!format!("{config:?}").contains("s3cret"));
    }
}
