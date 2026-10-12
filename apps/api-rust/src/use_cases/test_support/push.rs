use std::collections::HashMap;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::use_cases::ports::web_push_service::PushDeliveryResult;
use crate::use_cases::ports::{
    ExpoPushService, PushDeliveryError, PushPayload, PushSubscriptionKeys, WebPushService,
};

/// The error a real push service gives for a subscription that has expired.
fn web_subscription_gone() -> PushDeliveryError {
    PushDeliveryError::with_status("Received unexpected response code", 410)
}

/// The error Expo gives for a token whose app was uninstalled.
fn expo_device_not_registered() -> PushDeliveryError {
    PushDeliveryError::with_code(
        "The recipient device is not registered with FCM.",
        Some("DeviceNotRegistered".to_string()),
    )
}

/// Records every send attempt, delivered or not. A send succeeds unless its
/// endpoint was given a failure.
#[derive(Default)]
pub struct FakeWebPushService {
    sent: Mutex<Vec<(PushSubscriptionKeys, PushPayload)>>,
    failures: Mutex<HashMap<String, PushDeliveryError>>,
}

impl FakeWebPushService {
    /// Makes sends to `endpoint` fail with a 410: the subscription is gone.
    pub fn gone(self, endpoint: &str) -> Self {
        self.failing(endpoint, web_subscription_gone())
    }

    /// Makes sends to `endpoint` fail with `error`.
    pub fn failing(self, endpoint: &str, error: PushDeliveryError) -> Self {
        self.failures.lock().unwrap().insert(endpoint.to_string(), error);
        self
    }

    /// Every attempt, in call order.
    pub fn sent(&self) -> Vec<(PushSubscriptionKeys, PushPayload)> {
        self.sent.lock().unwrap().clone()
    }
}

#[async_trait]
impl WebPushService for FakeWebPushService {
    async fn send(
        &self,
        subscription: &PushSubscriptionKeys,
        payload: &PushPayload,
    ) -> PushDeliveryResult {
        self.sent.lock().unwrap().push((subscription.clone(), payload.clone()));
        match self.failures.lock().unwrap().get(&subscription.endpoint) {
            Some(error) => Err(error.clone()),
            None => Ok(()),
        }
    }
}

/// Records every send attempt, delivered or not. A send succeeds unless its
/// token was given a failure.
#[derive(Default)]
pub struct FakeExpoPushService {
    sent: Mutex<Vec<(String, PushPayload)>>,
    failures: Mutex<HashMap<String, PushDeliveryError>>,
}

impl FakeExpoPushService {
    /// Makes sends to `token` fail with a `DeviceNotRegistered` ticket: the
    /// token is dead.
    pub fn gone(self, token: &str) -> Self {
        self.failing(token, expo_device_not_registered())
    }

    /// Makes sends to `token` fail with `error`.
    pub fn failing(self, token: &str, error: PushDeliveryError) -> Self {
        self.failures.lock().unwrap().insert(token.to_string(), error);
        self
    }

    /// Every attempt, as (token, payload), in call order.
    pub fn sent(&self) -> Vec<(String, PushPayload)> {
        self.sent.lock().unwrap().clone()
    }
}

#[async_trait]
impl ExpoPushService for FakeExpoPushService {
    async fn send(&self, expo_push_token: &str, payload: &PushPayload) -> PushDeliveryResult {
        self.sent.lock().unwrap().push((expo_push_token.to_string(), payload.clone()));
        match self.failures.lock().unwrap().get(expo_push_token) {
            Some(error) => Err(error.clone()),
            None => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload() -> PushPayload {
        PushPayload { title: "t".to_string(), body: "b".to_string(), url: "/u".to_string() }
    }

    fn subscription(endpoint: &str) -> PushSubscriptionKeys {
        PushSubscriptionKeys {
            endpoint: endpoint.to_string(),
            p256dh: "p256dh".to_string(),
            auth: "auth".to_string(),
        }
    }

    #[tokio::test]
    async fn web_push_records_sends_and_reports_a_gone_subscription() {
        let service = FakeWebPushService::default()
            .gone("https://push.test/expired")
            .failing("https://push.test/flaky", PushDeliveryError::with_status("boom", 500));

        assert_eq!(service.send(&subscription("https://push.test/ok"), &payload()).await, Ok(()));
        let gone = service.send(&subscription("https://push.test/expired"), &payload()).await;
        let flaky = service.send(&subscription("https://push.test/flaky"), &payload()).await;

        assert!(gone.unwrap_err().is_subscription_gone());
        assert!(!flaky.unwrap_err().is_subscription_gone());
        let endpoints: Vec<String> =
            service.sent().into_iter().map(|(subscription, _)| subscription.endpoint).collect();
        assert_eq!(
            endpoints,
            vec!["https://push.test/ok", "https://push.test/expired", "https://push.test/flaky"]
        );
    }

    #[tokio::test]
    async fn expo_push_records_sends_and_reports_a_dead_token() {
        let service = FakeExpoPushService::default().gone("ExponentPushToken[dead]");

        assert_eq!(service.send("ExponentPushToken[live]", &payload()).await, Ok(()));
        let dead = service.send("ExponentPushToken[dead]", &payload()).await.unwrap_err();

        assert_eq!(dead.code.as_deref(), Some("DeviceNotRegistered"));
        assert!(dead.is_subscription_gone());
        assert_eq!(
            service.sent(),
            vec![
                ("ExponentPushToken[live]".to_string(), payload()),
                ("ExponentPushToken[dead]".to_string(), payload()),
            ]
        );
    }
}
