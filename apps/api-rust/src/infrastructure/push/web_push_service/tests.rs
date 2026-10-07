use std::sync::{Arc, Mutex};

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes128Gcm, Nonce};
use axum::body::Bytes;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::post;
use axum::Router;
use p256::ecdsa::signature::Verifier;
use p256::ecdsa::VerifyingKey;
use p256::elliptic_curve::sec1::ToEncodedPoint;
use p256::{PublicKey, SecretKey};
use rand::rngs::OsRng;
use rand::RngCore;
use serde_json::{json, Value};

use super::*;

const SUBJECT: &str = "mailto:push@trakwyn.test";

/// A VAPID key pair as `web-push generate-vapid-keys` prints it.
struct VapidKeys {
    public: String,
    private: String,
    verifying: VerifyingKey,
}

fn vapid_keys() -> VapidKeys {
    let signing = SigningKey::random(&mut OsRng);
    let verifying = *signing.verifying_key();
    VapidKeys {
        public: URL_SAFE_NO_PAD.encode(verifying.to_encoded_point(false).as_bytes()),
        private: URL_SAFE_NO_PAD.encode(signing.to_bytes()),
        verifying,
    }
}

fn service(keys: &VapidKeys) -> WebPushService {
    service_with(&keys.public, &keys.private, SUBJECT)
}

fn service_with(public: &str, private: &str, subject: &str) -> WebPushService {
    WebPushService::new(&PushConfig {
        vapid_public_key: public.to_string(),
        vapid_private_key: private.to_string(),
        vapid_subject: subject.to_string(),
    })
}

/// The browser's half of a subscription: the key pair and auth secret it
/// keeps, and the public values it hands the server.
struct Browser {
    secret: SecretKey,
    public: Vec<u8>,
    auth: [u8; 16],
}

impl Browser {
    fn new() -> Self {
        let secret = SecretKey::random(&mut OsRng);
        let public = secret.public_key().to_encoded_point(false).as_bytes().to_vec();
        let mut auth = [0u8; 16];
        OsRng.fill_bytes(&mut auth);
        Self { secret, public, auth }
    }

    fn subscription(&self, endpoint: &str) -> PushSubscriptionKeys {
        PushSubscriptionKeys {
            endpoint: endpoint.to_string(),
            p256dh: URL_SAFE_NO_PAD.encode(&self.public),
            auth: URL_SAFE_NO_PAD.encode(self.auth),
        }
    }

    /// Decrypts an `aes128gcm` body the way a browser does (RFC 8291 §3.4).
    fn decrypt(&self, body: &[u8]) -> Vec<u8> {
        let (salt, rest) = body.split_at(aes128gcm::SALT_LENGTH);
        let (record_size, rest) = rest.split_at(4);
        let record_size = u32::from_be_bytes(record_size.try_into().unwrap()) as usize;
        assert_eq!(record_size, 4096);
        let (key_id_length, rest) = rest.split_at(1);
        assert_eq!(key_id_length[0], 65);
        let (sender_public, records) = rest.split_at(65);

        let sender_key = PublicKey::from_sec1_bytes(sender_public).unwrap();
        let shared =
            p256::ecdh::diffie_hellman(self.secret.to_nonzero_scalar(), sender_key.as_affine());
        let (key, nonce_base) = aes128gcm::derive_key_and_nonce(
            shared.raw_secret_bytes(),
            &self.auth,
            &self.public,
            sender_public,
            salt,
        )
        .unwrap();
        let cipher = Aes128Gcm::new_from_slice(&key).unwrap();

        let chunks: Vec<&[u8]> = records.chunks(record_size).collect();
        let mut plaintext = Vec::new();
        for (index, chunk) in chunks.iter().enumerate() {
            let nonce = aes128gcm::record_nonce(&nonce_base, index as u64);
            let mut record = cipher.decrypt(Nonce::from_slice(&nonce), *chunk).unwrap();
            let delimiter = record.pop().unwrap();
            let is_last = index == chunks.len() - 1;
            assert_eq!(delimiter, if is_last { 2 } else { 1 }, "record {index}");
            plaintext.extend(record);
        }
        plaintext
    }
}

#[derive(Clone, Default)]
struct Received {
    requests: Arc<Mutex<Vec<(HeaderMap, Bytes)>>>,
}

impl Received {
    fn only(&self) -> (HeaderMap, Bytes) {
        let requests = self.requests.lock().unwrap();
        assert_eq!(requests.len(), 1);
        requests[0].clone()
    }

    fn count(&self) -> usize {
        self.requests.lock().unwrap().len()
    }
}

struct PushServer {
    origin: String,
    endpoint: String,
    received: Received,
}

/// A stand-in push service answering every POST with `status`.
async fn push_server(status: StatusCode) -> PushServer {
    let received = Received::default();
    let recorder = received.clone();
    let app = Router::new().route(
        "/push/{id}",
        post(move |headers: HeaderMap, body: Bytes| {
            let recorder = recorder.clone();
            async move {
                recorder.requests.lock().unwrap().push((headers, body));
                (status, [("location", "/push/elsewhere")], "response body")
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    PushServer { endpoint: format!("{origin}/push/subscription-1"), origin, received }
}

fn payload() -> PushPayload {
    PushPayload {
        title: "Upcoming interview: Acme".to_string(),
        body: "Phone interview tomorrow at 10:00 AM".to_string(),
        url: "/applications/app-1?section=interviews".to_string(),
    }
}

fn decode_segment(segment: &str) -> Value {
    serde_json::from_slice(&URL_SAFE_NO_PAD.decode(segment).unwrap()).unwrap()
}

#[tokio::test]
async fn sends_an_encrypted_payload_the_subscription_can_decrypt() {
    let server = push_server(StatusCode::CREATED).await;
    let keys = vapid_keys();
    let browser = Browser::new();

    service(&keys).send(&browser.subscription(&server.endpoint), &payload()).await.unwrap();

    let (headers, body) = server.received.only();
    assert_eq!(headers["content-encoding"], "aes128gcm");
    assert_eq!(headers["content-type"], "application/octet-stream");
    assert_eq!(headers["ttl"], "2419200");
    assert_eq!(headers["urgency"], "normal");
    assert_eq!(headers["content-length"], body.len().to_string().as_str());

    let plaintext = String::from_utf8(browser.decrypt(&body)).unwrap();
    // Byte for byte the JSON `apps/api` encrypts, key order included.
    assert_eq!(
        plaintext,
        r#"{"title":"Upcoming interview: Acme","body":"Phone interview tomorrow at 10:00 AM","data":{"url":"/applications/app-1?section=interviews"}}"#
    );
    // Header (16 + 4 + 1 + 65), the message, one delimiter byte and one tag.
    assert_eq!(body.len(), 86 + plaintext.len() + 1 + 16);
}

#[tokio::test]
async fn authorises_the_request_with_a_vapid_token_signed_by_the_private_key() {
    let server = push_server(StatusCode::CREATED).await;
    let keys = vapid_keys();
    let browser = Browser::new();
    let before = chrono::Utc::now().timestamp();

    service(&keys).send(&browser.subscription(&server.endpoint), &payload()).await.unwrap();

    let (headers, _) = server.received.only();
    let authorization = headers["authorization"].to_str().unwrap();
    let rest = authorization.strip_prefix("vapid t=").expect("a vapid scheme");
    let (token, public_key) = rest.split_once(", k=").expect("a k parameter");
    assert_eq!(public_key, keys.public);

    let segments: Vec<&str> = token.split('.').collect();
    assert_eq!(segments.len(), 3);
    assert_eq!(decode_segment(segments[0]), json!({ "typ": "JWT", "alg": "ES256" }));

    let claims = decode_segment(segments[1]);
    assert_eq!(claims["aud"], server.origin);
    assert_eq!(claims["sub"], SUBJECT);
    let exp = claims["exp"].as_i64().unwrap();
    let twelve_hours = 12 * 60 * 60;
    assert!((before + twelve_hours..=before + twelve_hours + 60).contains(&exp), "{exp}");
    assert_eq!(claims.as_object().unwrap().len(), 3);

    let signature = Signature::from_slice(&URL_SAFE_NO_PAD.decode(segments[2]).unwrap()).unwrap();
    let signing_input = format!("{}.{}", segments[0], segments[1]);
    keys.verifying.verify(signing_input.as_bytes(), &signature).expect("a valid ES256 signature");

    // A different key must not verify it.
    assert!(vapid_keys().verifying.verify(signing_input.as_bytes(), &signature).is_err());
}

#[tokio::test]
async fn every_message_uses_a_fresh_key_and_salt() {
    let server = push_server(StatusCode::OK).await;
    let keys = vapid_keys();
    let browser = Browser::new();
    let service = service(&keys);

    service.send(&browser.subscription(&server.endpoint), &payload()).await.unwrap();
    service.send(&browser.subscription(&server.endpoint), &payload()).await.unwrap();

    let requests = server.received.requests.lock().unwrap();
    let (first, second) = (&requests[0].1, &requests[1].1);
    assert_ne!(first[..16], second[..16], "salt");
    assert_ne!(first[21..86], second[21..86], "sender key");
    assert_eq!(browser.decrypt(first), browser.decrypt(second));
}

#[tokio::test]
async fn non_ascii_text_survives_the_round_trip() {
    let server = push_server(StatusCode::OK).await;
    let browser = Browser::new();
    let payload = PushPayload {
        title: "Entretien à venir : Société Générale".to_string(),
        body: "Développeur \u{2014} 面接 завтра 🎉".to_string(),
        url: "/applications/app-1".to_string(),
    };

    service(&vapid_keys()).send(&browser.subscription(&server.endpoint), &payload).await.unwrap();

    let (_, body) = server.received.only();
    let message: Value = serde_json::from_slice(&browser.decrypt(&body)).unwrap();
    assert_eq!(message["title"], payload.title);
    assert_eq!(message["body"], payload.body);
    assert_eq!(message["data"]["url"], payload.url);
}

#[tokio::test]
async fn a_message_longer_than_one_record_is_split_across_records() {
    let server = push_server(StatusCode::OK).await;
    let browser = Browser::new();
    let payload = PushPayload { body: "x".repeat(9000), ..payload() };

    service(&vapid_keys()).send(&browser.subscription(&server.endpoint), &payload).await.unwrap();

    let (_, body) = server.received.only();
    let plaintext = browser.decrypt(&body);
    let message: Value = serde_json::from_slice(&plaintext).unwrap();
    assert_eq!(message["body"], payload.body);
    // Three records: two full ones and the remainder.
    assert_eq!(body.len(), 86 + plaintext.len() + 3 * 17);
    assert_eq!((body.len() - 86).div_ceil(4096), 3);
}

#[tokio::test]
async fn accepts_keys_in_the_standard_base64_alphabet_with_padding() {
    let server = push_server(StatusCode::OK).await;
    let browser = Browser::new();
    let standard = base64::engine::general_purpose::STANDARD;
    let subscription = PushSubscriptionKeys {
        endpoint: server.endpoint.clone(),
        p256dh: standard.encode(&browser.public),
        auth: standard.encode(browser.auth),
    };

    service(&vapid_keys()).send(&subscription, &payload()).await.unwrap();

    let (_, body) = server.received.only();
    assert!(!browser.decrypt(&body).is_empty());
}

async fn send_to_server_answering(status: StatusCode) -> (PushDeliveryResult, PushServer) {
    let server = push_server(status).await;
    let result = service(&vapid_keys())
        .send(&Browser::new().subscription(&server.endpoint), &payload())
        .await;
    (result, server)
}

#[tokio::test]
async fn any_2xx_is_delivered() {
    for status in
        [StatusCode::OK, StatusCode::CREATED, StatusCode::ACCEPTED, StatusCode::NO_CONTENT]
    {
        let (result, _) = send_to_server_answering(status).await;
        assert_eq!(result, Ok(()), "{status}");
    }
}

#[tokio::test]
async fn a_410_reports_the_subscription_as_gone() {
    let (result, _) = send_to_server_answering(StatusCode::GONE).await;

    let err = result.unwrap_err();
    assert_eq!(err, PushDeliveryError::with_status("Received unexpected response code", 410));
    assert!(err.is_subscription_gone());
}

#[tokio::test]
async fn a_404_carries_its_status_but_is_not_gone() {
    // `apps/api` deletes a subscription on 410 only; a 404 is an ordinary failure there.
    let (result, _) = send_to_server_answering(StatusCode::NOT_FOUND).await;

    let err = result.unwrap_err();
    assert_eq!(err, PushDeliveryError::with_status("Received unexpected response code", 404));
    assert!(!err.is_subscription_gone());
}

#[tokio::test]
async fn other_failures_carry_their_status() {
    for status in [400u16, 401, 403, 413, 429, 500, 503] {
        let (result, _) = send_to_server_answering(StatusCode::from_u16(status).unwrap()).await;
        let err = result.unwrap_err();
        assert_eq!(err.message, "Received unexpected response code");
        assert_eq!(err.status_code, Some(status));
        assert!(!err.is_subscription_gone());
    }
}

#[tokio::test]
async fn a_redirect_is_a_failure_not_followed() {
    let (result, server) = send_to_server_answering(StatusCode::TEMPORARY_REDIRECT).await;

    assert_eq!(result.unwrap_err().status_code, Some(307));
    assert_eq!(server.received.count(), 1);
}

#[tokio::test]
async fn an_unreachable_endpoint_fails_without_quoting_it() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    drop(listener);
    let endpoint = format!("http://{address}/push/secret-capability");

    let err = service(&vapid_keys())
        .send(&Browser::new().subscription(&endpoint), &payload())
        .await
        .unwrap_err();

    assert_eq!((err.status_code, err.code.clone()), (None, None));
    assert!(!err.message.contains("secret-capability"), "{}", err.message);
    assert!(!err.is_subscription_gone());
}

async fn send_expecting_no_request(
    service: WebPushService,
    subscription: impl FnOnce(&Browser, &str) -> PushSubscriptionKeys,
) -> String {
    let server = push_server(StatusCode::CREATED).await;
    let browser = Browser::new();
    let err =
        service.send(&subscription(&browser, &server.endpoint), &payload()).await.unwrap_err();
    assert_eq!(server.received.count(), 0, "nothing may be sent");
    assert_eq!((err.status_code, err.code.clone()), (None, None));
    err.message
}

fn valid_subscription(browser: &Browser, endpoint: &str) -> PushSubscriptionKeys {
    browser.subscription(endpoint)
}

#[tokio::test]
async fn fails_when_vapid_is_not_configured() {
    let keys = vapid_keys();
    for (public, private) in [("", ""), (keys.public.as_str(), ""), ("", keys.private.as_str())] {
        let service = service_with(public, private, SUBJECT);
        assert_eq!(
            send_expecting_no_request(service, valid_subscription).await,
            "VAPID keys not configured"
        );
    }
}

#[test]
fn exposes_the_public_key_for_subscribing() {
    let keys = vapid_keys();
    assert_eq!(service(&keys).vapid_public_key(), keys.public);
    assert_eq!(service_with("", "", SUBJECT).vapid_public_key(), "");
}

#[tokio::test]
async fn rejects_a_bad_vapid_subject() {
    let keys = vapid_keys();
    let cases = [
        ("", "No subject set in vapidDetails.subject."),
        ("not a url", "Vapid subject is not a valid URL. not a url"),
        (
            "http://trakwyn.test/contact",
            "Vapid subject is not an https: or mailto: URL. http://trakwyn.test/contact",
        ),
    ];
    for (subject, message) in cases {
        let service = service_with(&keys.public, &keys.private, subject);
        assert_eq!(send_expecting_no_request(service, valid_subscription).await, message);
    }
}

#[tokio::test]
async fn accepts_an_https_vapid_subject() {
    let server = push_server(StatusCode::CREATED).await;
    let keys = vapid_keys();
    let service = service_with(&keys.public, &keys.private, "https://trakwyn.test/contact");

    service.send(&Browser::new().subscription(&server.endpoint), &payload()).await.unwrap();

    let (headers, _) = server.received.only();
    let token = headers["authorization"].to_str().unwrap();
    let claims = token.trim_start_matches("vapid t=").split('.').nth(1).unwrap();
    assert_eq!(decode_segment(claims)["sub"], "https://trakwyn.test/contact");
}

#[tokio::test]
async fn rejects_malformed_vapid_keys() {
    let keys = vapid_keys();
    let short = URL_SAFE_NO_PAD.encode([7u8; 20]);
    let cases = [
        (
            format!("{}=", keys.public),
            keys.private.clone(),
            "Vapid public key must be a URL safe Base 64 (without \"=\")",
        ),
        (
            short.clone(),
            keys.private.clone(),
            "Vapid public key should be 65 bytes long when decoded.",
        ),
        (
            keys.public.clone(),
            "not+url/safe".to_string(),
            "Vapid private key must be a URL safe Base 64 (without \"=\")",
        ),
        (keys.public.clone(), short, "Vapid private key should be 32 bytes long when decoded."),
    ];
    for (public, private, message) in cases {
        let service = service_with(&public, &private, SUBJECT);
        assert_eq!(send_expecting_no_request(service, valid_subscription).await, message);
    }
}

#[tokio::test]
async fn rejects_a_subscription_it_cannot_encrypt_to() {
    type MakeSubscription = fn(&Browser, &str) -> PushSubscriptionKeys;
    let cases: [(MakeSubscription, &str); 6] = [
        (
            |browser, _| browser.subscription(""),
            "You must pass in a subscription with at least an endpoint.",
        ),
        (
            |browser, endpoint| PushSubscriptionKeys {
                p256dh: String::new(),
                ..browser.subscription(endpoint)
            },
            "To send a message with a payload, the subscription must have 'auth' and 'p256dh' keys.",
        ),
        (
            |browser, endpoint| PushSubscriptionKeys {
                auth: String::new(),
                ..browser.subscription(endpoint)
            },
            "To send a message with a payload, the subscription must have 'auth' and 'p256dh' keys.",
        ),
        (
            |browser, endpoint| PushSubscriptionKeys {
                p256dh: URL_SAFE_NO_PAD.encode([4u8; 64]),
                ..browser.subscription(endpoint)
            },
            "The subscription p256dh value should be 65 bytes long.",
        ),
        (
            |browser, endpoint| PushSubscriptionKeys {
                auth: URL_SAFE_NO_PAD.encode([1u8; 15]),
                ..browser.subscription(endpoint)
            },
            "The subscription auth key should be at least 16 bytes long",
        ),
        (
            // The right length, but not a point on the curve.
            |browser, endpoint| PushSubscriptionKeys {
                p256dh: URL_SAFE_NO_PAD.encode([4u8; 65]),
                ..browser.subscription(endpoint)
            },
            "Public key is not valid for specified curve",
        ),
    ];
    for (subscription, message) in cases {
        let service = service(&vapid_keys());
        assert_eq!(send_expecting_no_request(service, subscription).await, message);
    }
}

#[tokio::test]
async fn rejects_an_endpoint_that_is_not_a_url() {
    let message = send_expecting_no_request(service(&vapid_keys()), |browser, _| {
        browser.subscription("not a url")
    })
    .await;
    assert_eq!(message, "VAPID audience is not a url. null//null");
}

#[test]
fn the_audience_is_the_endpoints_origin() {
    let cases = [
        ("https://fcm.googleapis.com/fcm/send/abc:def", "https://fcm.googleapis.com"),
        (
            "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
            "https://updates.push.services.mozilla.com",
        ),
        ("https://web.push.apple.com/QGk?x=1", "https://web.push.apple.com"),
        ("http://127.0.0.1:8080/push/1", "http://127.0.0.1:8080"),
    ];
    for (endpoint, expected) in cases {
        assert_eq!(audience(endpoint).unwrap(), expected);
    }
}

#[test]
fn lenient_base64_reads_both_alphabets_and_ignores_padding() {
    assert_eq!(decode_base64_lenient("-_-_"), vec![0xfb, 0xff, 0xbf]);
    assert_eq!(decode_base64_lenient("+/+/"), vec![0xfb, 0xff, 0xbf]);
    assert_eq!(decode_base64_lenient("YQ=="), b"a");
    assert_eq!(decode_base64_lenient("YQ"), b"a");
    assert_eq!(decode_base64_lenient("YWJj\n"), b"abc");
    assert_eq!(decode_base64_lenient(""), Vec::<u8>::new());
}
