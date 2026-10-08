use async_trait::async_trait;

use crate::use_cases::errors::DomainError;

/// The HTTP status a push service answers with once a subscription is
/// permanently gone.
const SUBSCRIPTION_GONE_STATUS: u16 = 410;
/// The Expo ticket error for a token that is permanently dead.
const EXPO_DEVICE_NOT_REGISTERED: &str = "DeviceNotRegistered";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PushSubscriptionKeys {
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PushPayload {
    pub title: String,
    pub body: String,
    pub url: String,
}

/// Why one push was not delivered.
///
/// The two push ports fail with this rather than a `DomainError` because the
/// caller has to tell a dead subscription from a transient failure, and
/// neither is something a client is ever shown. `status_code` is the push
/// service's HTTP status (web push); `code` is the provider's own error code
/// (an Expo ticket's `details.error`).
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{message}")]
pub struct PushDeliveryError {
    pub message: String,
    pub status_code: Option<u16>,
    pub code: Option<String>,
}

impl PushDeliveryError {
    pub fn new(message: impl Into<String>) -> Self {
        Self { message: message.into(), status_code: None, code: None }
    }

    pub fn with_status(message: impl Into<String>, status_code: u16) -> Self {
        Self { message: message.into(), status_code: Some(status_code), code: None }
    }

    pub fn with_code(message: impl Into<String>, code: Option<String>) -> Self {
        Self { message: message.into(), status_code: None, code }
    }

    /// Whether nothing will ever be delivered to this subscription again, so
    /// the caller should delete it: a web-push 410, or an Expo
    /// `DeviceNotRegistered` ticket. A status code, when there is one, is the
    /// only thing consulted.
    pub fn is_subscription_gone(&self) -> bool {
        match self.status_code {
            Some(status) => status == SUBSCRIPTION_GONE_STATUS,
            None => self.code.as_deref() == Some(EXPO_DEVICE_NOT_REGISTERED),
        }
    }
}

impl From<PushDeliveryError> for DomainError {
    fn from(err: PushDeliveryError) -> Self {
        DomainError::internal(err)
    }
}

pub type PushDeliveryResult = Result<(), PushDeliveryError>;

/// Delivering a push notification to one browser subscription.
///
/// Only the sending half of the web push service is here: this is what the
/// use case depends on. VAPID key handling stays an infrastructure detail.
///
/// Fails when delivery fails, including when VAPID is not configured, which
/// callers treat as any other delivery failure rather than as a special case.
#[async_trait]
pub trait WebPushService: Send + Sync {
    async fn send(
        &self,
        subscription: &PushSubscriptionKeys,
        payload: &PushPayload,
    ) -> PushDeliveryResult;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_410_means_the_subscription_is_gone() {
        assert!(PushDeliveryError::with_status("gone", 410).is_subscription_gone());
    }

    #[test]
    fn other_statuses_are_not_gone() {
        for status in [400, 401, 403, 404, 413, 429, 500] {
            assert!(!PushDeliveryError::with_status("no", status).is_subscription_gone());
        }
    }

    #[test]
    fn an_expo_device_not_registered_code_means_gone() {
        let err = PushDeliveryError::with_code("dead", Some("DeviceNotRegistered".to_string()));
        assert!(err.is_subscription_gone());
    }

    #[test]
    fn other_codes_and_plain_failures_are_not_gone() {
        let rate = PushDeliveryError::with_code("slow down", Some("MessageRateExceeded".into()));
        assert!(!rate.is_subscription_gone());
        assert!(!PushDeliveryError::new("VAPID keys not configured").is_subscription_gone());
    }

    #[test]
    fn a_status_code_takes_precedence_over_a_code() {
        let err = PushDeliveryError {
            message: "odd".to_string(),
            status_code: Some(500),
            code: Some("DeviceNotRegistered".to_string()),
        };
        assert!(!err.is_subscription_gone());
    }

    #[test]
    fn converts_to_an_internal_domain_error() {
        let err: DomainError = PushDeliveryError::with_status("gone", 410).into();
        assert!(matches!(err, DomainError::Internal(_)));
    }
}
