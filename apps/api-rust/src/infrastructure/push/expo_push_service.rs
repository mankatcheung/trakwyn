use async_trait::async_trait;
use reqwest::header::{ACCEPT, CONTENT_TYPE};
use serde::Serialize;
use serde_json::Value;

use crate::use_cases::ports::web_push_service::PushDeliveryResult;
use crate::use_cases::ports::{
    ExpoPushService as ExpoPushServicePort, PushDeliveryError, PushPayload,
};

const EXPO_PUSH_API_URL: &str = "https://exp.host/--/api/v2/push/send";
const JSON_CONTENT_TYPE: &str = "application/json";
const TICKET_STATUS_ERROR: &str = "error";
const DEFAULT_TICKET_ERROR_MESSAGE: &str = "Expo push delivery failed";

#[derive(Serialize)]
struct ExpoMessage<'a> {
    to: &'a str,
    title: &'a str,
    body: &'a str,
    data: ExpoMessageData<'a>,
}

#[derive(Serialize)]
struct ExpoMessageData<'a> {
    url: &'a str,
}

/// Thin wrapper around Expo's push notification HTTP API: a single
/// unauthenticated JSON POST, no SDK needed. See
/// <https://docs.expo.dev/push-notifications/sending-notifications/#http2-api>.
pub struct ExpoPushService {
    api_url: String,
    client: reqwest::Client,
}

impl ExpoPushService {
    /// `api_url` is the full URL of the send endpoint; tests point it at a
    /// local stub. [`Default`] uses Expo's.
    pub fn new(api_url: impl Into<String>) -> Self {
        Self { api_url: api_url.into(), client: reqwest::Client::new() }
    }
}

impl Default for ExpoPushService {
    fn default() -> Self {
        Self::new(EXPO_PUSH_API_URL)
    }
}

#[async_trait]
impl ExpoPushServicePort for ExpoPushService {
    async fn send(&self, expo_push_token: &str, payload: &PushPayload) -> PushDeliveryResult {
        let message = ExpoMessage {
            to: expo_push_token,
            title: &payload.title,
            body: &payload.body,
            data: ExpoMessageData { url: &payload.url },
        };
        let body = serde_json::to_vec(&message)
            .map_err(|_| PushDeliveryError::new("The push payload could not be encoded"))?;

        let response = self
            .client
            .post(&self.api_url)
            .header(ACCEPT, JSON_CONTENT_TYPE)
            .header(CONTENT_TYPE, JSON_CONTENT_TYPE)
            .body(body)
            .send()
            .await
            .map_err(|err| PushDeliveryError::new(err.without_url().to_string()))?;

        let status = response.status();
        if !status.is_success() {
            // No status code on the error: a failing Expo API says nothing
            // about the token, so this is never "subscription gone".
            return Err(PushDeliveryError::new(format!(
                "Expo push API responded with status {}",
                status.as_u16()
            )));
        }

        let result: Value = response
            .json()
            .await
            .map_err(|err| PushDeliveryError::new(err.without_url().to_string()))?;

        // One message was sent, so only the first ticket is ours.
        let ticket = result.get("data").and_then(|data| data.get(0));
        let Some(ticket) = ticket else {
            return Ok(());
        };
        if ticket.get("status").and_then(Value::as_str) != Some(TICKET_STATUS_ERROR) {
            return Ok(());
        }

        let message =
            ticket.get("message").and_then(Value::as_str).unwrap_or(DEFAULT_TICKET_ERROR_MESSAGE);
        let code = ticket
            .get("details")
            .and_then(|details| details.get("error"))
            .and_then(Value::as_str)
            .map(str::to_string);
        Err(PushDeliveryError::with_code(message, code))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use axum::http::{HeaderMap, StatusCode};
    use axum::routing::post;
    use axum::Router;
    use serde_json::json;

    use super::*;

    #[derive(Clone, Default)]
    struct Received {
        requests: Arc<Mutex<Vec<(HeaderMap, String)>>>,
    }

    /// A stand-in for Expo's API answering every POST with `status` and `body`.
    async fn stub(status: StatusCode, body: &'static str) -> (String, Received) {
        let received = Received::default();
        let recorder = received.clone();
        let app = Router::new().route(
            "/--/api/v2/push/send",
            post(move |headers: HeaderMap, request_body: String| {
                let recorder = recorder.clone();
                async move {
                    recorder.requests.lock().unwrap().push((headers, request_body));
                    (status, body)
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (format!("http://{address}/--/api/v2/push/send"), received)
    }

    fn payload() -> PushPayload {
        PushPayload {
            title: "Upcoming interview: Acme".to_string(),
            body: "Phone interview tomorrow at 10:00 AM".to_string(),
            url: "/applications/app-1?section=interviews".to_string(),
        }
    }

    #[test]
    fn defaults_to_expos_endpoint() {
        assert_eq!(ExpoPushService::default().api_url, "https://exp.host/--/api/v2/push/send");
    }

    #[tokio::test]
    async fn posts_the_token_title_body_and_url() {
        let (url, received) = stub(StatusCode::OK, r#"{"data":[{"status":"ok"}]}"#).await;

        ExpoPushService::new(url).send("ExponentPushToken[abc123]", &payload()).await.unwrap();

        let requests = received.requests.lock().unwrap();
        assert_eq!(requests.len(), 1);
        let (headers, body) = &requests[0];
        assert_eq!(headers["accept"], "application/json");
        assert_eq!(headers["content-type"], "application/json");
        // Byte for byte what `apps/api` sends, key order included.
        assert_eq!(
            body,
            r#"{"to":"ExponentPushToken[abc123]","title":"Upcoming interview: Acme","body":"Phone interview tomorrow at 10:00 AM","data":{"url":"/applications/app-1?section=interviews"}}"#
        );
    }

    #[tokio::test]
    async fn fails_when_the_http_response_is_not_ok() {
        let (url, _) = stub(StatusCode::INTERNAL_SERVER_ERROR, "").await;

        let err = ExpoPushService::new(url).send("ExponentPushToken[abc123]", &payload()).await;

        let err = err.unwrap_err();
        assert_eq!(err.message, "Expo push API responded with status 500");
        assert_eq!((err.status_code, err.code.clone()), (None, None));
        assert!(!err.is_subscription_gone());
    }

    #[tokio::test]
    async fn an_http_410_from_the_api_itself_is_not_subscription_gone() {
        let (url, _) = stub(StatusCode::GONE, "").await;
        let err = ExpoPushService::new(url).send("token", &payload()).await.unwrap_err();
        assert_eq!(err.message, "Expo push API responded with status 410");
        assert!(!err.is_subscription_gone());
    }

    #[tokio::test]
    async fn carries_the_ticket_error_code_when_delivery_fails() {
        let ticket = json!({ "data": [{
            "status": "error",
            "message": "The Expo push token is not a valid Expo push token",
            "details": { "error": "DeviceNotRegistered" },
        }]});
        let (url, _) = stub(StatusCode::OK, Box::leak(ticket.to_string().into_boxed_str())).await;

        let err = ExpoPushService::new(url).send("bad-token", &payload()).await.unwrap_err();

        assert_eq!(err.message, "The Expo push token is not a valid Expo push token");
        assert_eq!(err.code.as_deref(), Some("DeviceNotRegistered"));
        assert!(err.is_subscription_gone());
    }

    #[tokio::test]
    async fn a_ticket_error_without_details_gets_the_default_message_and_no_code() {
        let (url, _) = stub(StatusCode::OK, r#"{"data":[{"status":"error"}]}"#).await;

        let err = ExpoPushService::new(url).send("token", &payload()).await.unwrap_err();

        assert_eq!(err, PushDeliveryError::new("Expo push delivery failed"));
        assert!(!err.is_subscription_gone());
    }

    #[tokio::test]
    async fn another_ticket_error_is_not_subscription_gone() {
        let body = r#"{"data":[{"status":"error","message":"Too many","details":{"error":"MessageRateExceeded"}}]}"#;
        let (url, _) = stub(StatusCode::OK, body).await;

        let err = ExpoPushService::new(url).send("token", &payload()).await.unwrap_err();

        assert_eq!(err.code.as_deref(), Some("MessageRateExceeded"));
        assert!(!err.is_subscription_gone());
    }

    #[tokio::test]
    async fn a_response_with_no_tickets_counts_as_delivered() {
        let (url, _) = stub(StatusCode::OK, r#"{"errors":[{"code":"X"}]}"#).await;
        ExpoPushService::new(url).send("token", &payload()).await.unwrap();
    }

    #[tokio::test]
    async fn a_body_that_is_not_json_fails() {
        let (url, _) = stub(StatusCode::OK, "<html>").await;
        let err = ExpoPushService::new(url).send("token", &payload()).await.unwrap_err();
        assert_eq!((err.status_code, err.code), (None, None));
    }

    #[tokio::test]
    async fn an_unreachable_api_fails_without_quoting_the_url() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        drop(listener);

        let err = ExpoPushService::new(format!("http://{address}/send"))
            .send("token", &payload())
            .await
            .unwrap_err();

        assert!(!err.message.contains(&address.to_string()), "{}", err.message);
        assert!(!err.is_subscription_gone());
    }
}
