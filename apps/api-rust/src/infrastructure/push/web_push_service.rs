use async_trait::async_trait;
use base64::alphabet;
use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig, URL_SAFE_NO_PAD};
use base64::engine::DecodePaddingMode;
use base64::Engine;
use p256::ecdsa::signature::Signer;
use p256::ecdsa::{Signature, SigningKey};
use reqwest::header::{AUTHORIZATION, CONTENT_ENCODING, CONTENT_TYPE};
use reqwest::Url;
use serde::Serialize;

use super::aes128gcm;
use crate::config::push::PushConfig;
use crate::use_cases::clock;
use crate::use_cases::ports::web_push_service::PushDeliveryResult;
use crate::use_cases::ports::{
    PushDeliveryError, PushPayload, PushSubscriptionKeys, WebPushService as WebPushServicePort,
};

/// How long the push service keeps an undelivered message: four weeks.
const TTL_SECONDS: u32 = 2_419_200;
const URGENCY: &str = "normal";
const CONTENT_ENCODING_AES128GCM: &str = "aes128gcm";
const CONTENT_TYPE_OCTET_STREAM: &str = "application/octet-stream";
const TTL_HEADER: &str = "TTL";
const URGENCY_HEADER: &str = "Urgency";

/// How long each VAPID token is valid for: twelve hours.
const VAPID_EXPIRATION_SECONDS: i64 = 12 * 60 * 60;
const VAPID_PUBLIC_KEY_LENGTH: usize = 65;
const VAPID_PRIVATE_KEY_LENGTH: usize = 32;
const VAPID_SUBJECT_SCHEMES: [&str; 2] = ["https", "mailto"];

/// The retired Google Cloud Messaging endpoint, which never accepted VAPID.
const GCM_ENDPOINT_PREFIX: &str = "https://android.googleapis.com/gcm/send";

const UNEXPECTED_RESPONSE_MESSAGE: &str = "Received unexpected response code";

/// Decodes the way Node's `Buffer.from(value, 'base64url')` does: either
/// alphabet, padding optional, stray characters ignored.
const LENIENT_BASE64: GeneralPurpose = GeneralPurpose::new(
    &alphabet::URL_SAFE,
    GeneralPurposeConfig::new()
        .with_decode_allow_trailing_bits(true)
        .with_decode_padding_mode(DecodePaddingMode::RequireNone),
);

fn decode_base64_lenient(value: &str) -> Vec<u8> {
    let mut symbols: Vec<u8> = value
        .bytes()
        .filter_map(|byte| match byte {
            b'+' => Some(b'-'),
            b'/' => Some(b'_'),
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' => Some(byte),
            _ => None,
        })
        .collect();
    // A lone trailing symbol carries less than a byte.
    if symbols.len() % 4 == 1 {
        symbols.pop();
    }
    LENIENT_BASE64.decode(symbols).unwrap_or_default()
}

fn is_url_safe_base64(value: &str) -> bool {
    !value.is_empty()
        && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn fail<T>(message: impl Into<String>) -> Result<T, PushDeliveryError> {
    Err(PushDeliveryError::new(message))
}

fn validate_subject(subject: &str) -> Result<(), PushDeliveryError> {
    if subject.is_empty() {
        return fail("No subject set in vapidDetails.subject.");
    }
    let Ok(url) = Url::parse(subject) else {
        return fail(format!("Vapid subject is not a valid URL. {subject}"));
    };
    if !VAPID_SUBJECT_SCHEMES.contains(&url.scheme()) {
        return fail(format!("Vapid subject is not an https: or mailto: URL. {subject}"));
    }
    Ok(())
}

fn validate_public_key(public_key: &str) -> Result<(), PushDeliveryError> {
    if public_key.is_empty() {
        return fail("No key set vapidDetails.publicKey");
    }
    if !is_url_safe_base64(public_key) {
        return fail("Vapid public key must be a URL safe Base 64 (without \"=\")");
    }
    if decode_base64_lenient(public_key).len() != VAPID_PUBLIC_KEY_LENGTH {
        return fail("Vapid public key should be 65 bytes long when decoded.");
    }
    Ok(())
}

fn validate_private_key(private_key: &str) -> Result<Vec<u8>, PushDeliveryError> {
    if private_key.is_empty() {
        return fail("No key set in vapidDetails.privateKey");
    }
    if !is_url_safe_base64(private_key) {
        return fail("Vapid private key must be a URL safe Base 64 (without \"=\")");
    }
    let decoded = decode_base64_lenient(private_key);
    if decoded.len() != VAPID_PRIVATE_KEY_LENGTH {
        return fail("Vapid private key should be 32 bytes long when decoded.");
    }
    Ok(decoded)
}

/// The origin of the push service, which the VAPID token is addressed to.
fn audience(endpoint: &str) -> Result<String, PushDeliveryError> {
    let url = Url::parse(endpoint).ok();
    let host = url.as_ref().and_then(|url| url.host_str().map(|host| (url, host)));
    let Some((url, host)) = host else {
        return fail("VAPID audience is not a url. null//null");
    };
    Ok(match url.port() {
        Some(port) => format!("{}://{host}:{port}", url.scheme()),
        None => format!("{}://{host}", url.scheme()),
    })
}

#[derive(Serialize)]
struct JwtHeader {
    typ: &'static str,
    alg: &'static str,
}

#[derive(Serialize)]
struct JwtClaims<'a> {
    aud: &'a str,
    exp: i64,
    sub: &'a str,
}

fn encode_json_segment(value: &impl Serialize) -> Result<String, PushDeliveryError> {
    let json = serde_json::to_vec(value)
        .map_err(|_| PushDeliveryError::new("The VAPID token could not be encoded"))?;
    Ok(URL_SAFE_NO_PAD.encode(json))
}

/// An ES256 JWT naming the push service, this server's contact and an expiry.
fn sign_vapid_token(
    audience: &str,
    subject: &str,
    private_key: &[u8],
) -> Result<String, PushDeliveryError> {
    let header = encode_json_segment(&JwtHeader { typ: "JWT", alg: "ES256" })?;
    let exp = clock::now().timestamp() + VAPID_EXPIRATION_SECONDS;
    let claims = encode_json_segment(&JwtClaims { aud: audience, exp, sub: subject })?;
    let signing_input = format!("{header}.{claims}");

    let key = SigningKey::from_slice(private_key)
        .map_err(|_| PushDeliveryError::new("The VAPID private key is not a valid P-256 key"))?;
    let signature: Signature = key.sign(signing_input.as_bytes());
    Ok(format!("{signing_input}.{}", URL_SAFE_NO_PAD.encode(signature.to_bytes())))
}

/// What the browser's service worker receives.
#[derive(Serialize)]
struct NotificationMessage<'a> {
    title: &'a str,
    body: &'a str,
    data: NotificationData<'a>,
}

#[derive(Serialize)]
struct NotificationData<'a> {
    url: &'a str,
}

/// Browser push over the Web Push protocol: the payload encrypted to the
/// subscription (RFC 8291, `aes128gcm`) and the request authorised with a
/// VAPID token (RFC 8292).
///
/// The keys are validated on each send, not at construction, so a
/// misconfigured or unconfigured service starts and fails per message. A
/// response outside 2xx fails with "Received unexpected response code" and
/// the status; redirects are not followed.
pub struct WebPushService {
    public_key: String,
    private_key: String,
    subject: String,
    is_configured: bool,
    client: reqwest::Client,
}

impl WebPushService {
    pub fn new(config: &PushConfig) -> Self {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap_or_default();
        Self {
            public_key: config.vapid_public_key.clone(),
            private_key: config.vapid_private_key.clone(),
            subject: config.vapid_subject.clone(),
            is_configured: config.is_configured(),
            client,
        }
    }

    /// The key browsers subscribe with; empty when web push is not configured.
    pub fn vapid_public_key(&self) -> &str {
        &self.public_key
    }

    fn encrypt(
        subscription: &PushSubscriptionKeys,
        message: &[u8],
    ) -> Result<Vec<u8>, PushDeliveryError> {
        if subscription.endpoint.is_empty() {
            return fail("You must pass in a subscription with at least an endpoint.");
        }
        if subscription.p256dh.is_empty() || subscription.auth.is_empty() {
            return fail(
                "To send a message with a payload, the subscription must have 'auth' and 'p256dh' keys.",
            );
        }
        let receiver_public = decode_base64_lenient(&subscription.p256dh);
        if receiver_public.len() != aes128gcm::PUBLIC_KEY_LENGTH {
            return fail("The subscription p256dh value should be 65 bytes long.");
        }
        let auth_secret = decode_base64_lenient(&subscription.auth);
        if auth_secret.len() < aes128gcm::MIN_AUTH_SECRET_LENGTH {
            return fail("The subscription auth key should be at least 16 bytes long");
        }
        aes128gcm::encrypt(message, &receiver_public, &auth_secret)
            .map_err(|err| PushDeliveryError::new(err.to_string()))
    }
}

#[async_trait]
impl WebPushServicePort for WebPushService {
    async fn send(
        &self,
        subscription: &PushSubscriptionKeys,
        payload: &PushPayload,
    ) -> PushDeliveryResult {
        if !self.is_configured {
            return fail("VAPID keys not configured");
        }
        validate_subject(&self.subject)?;
        validate_public_key(&self.public_key)?;
        let private_key = validate_private_key(&self.private_key)?;

        let message = serde_json::to_vec(&NotificationMessage {
            title: &payload.title,
            body: &payload.body,
            data: NotificationData { url: &payload.url },
        })
        .map_err(|_| PushDeliveryError::new("The push payload could not be encoded"))?;
        let body = Self::encrypt(subscription, &message)?;

        let mut request = self
            .client
            .post(&subscription.endpoint)
            .header(TTL_HEADER, TTL_SECONDS)
            .header(CONTENT_TYPE, CONTENT_TYPE_OCTET_STREAM)
            .header(CONTENT_ENCODING, CONTENT_ENCODING_AES128GCM)
            .header(URGENCY_HEADER, URGENCY);

        if subscription.endpoint.starts_with(GCM_ENDPOINT_PREFIX) {
            tracing::warn!(
                "Attempt to send push notification to GCM endpoint, but no GCM key is defined."
            );
        } else {
            let audience = audience(&subscription.endpoint)?;
            let token = sign_vapid_token(&audience, &self.subject, &private_key)?;
            request =
                request.header(AUTHORIZATION, format!("vapid t={token}, k={}", self.public_key));
        }

        // The endpoint is a capability URL, so it is kept out of the error text.
        let response = request
            .body(body)
            .send()
            .await
            .map_err(|err| PushDeliveryError::new(err.without_url().to_string()))?;

        let status = response.status();
        if !status.is_success() {
            return Err(PushDeliveryError::with_status(
                UNEXPECTED_RESPONSE_MESSAGE,
                status.as_u16(),
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;
