use async_trait::async_trait;

use crate::use_cases::ports::web_push_service::{PushDeliveryResult, PushPayload};

/// Delivering a push notification to one Expo push token: the mobile
/// counterpart of `WebPushService`.
///
/// Fails when delivery fails. A failure whose `code` is `DeviceNotRegistered`
/// means the token is permanently dead (app uninstalled, token rotated) and
/// the caller should stop retrying it, mirroring how web push signals an
/// expired subscription with a 410 status;
/// `PushDeliveryError::is_subscription_gone` covers both.
#[async_trait]
pub trait ExpoPushService: Send + Sync {
    async fn send(&self, expo_push_token: &str, payload: &PushPayload) -> PushDeliveryResult;
}
