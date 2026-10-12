use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use chrono::Utc;
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use reqwest::header::ACCEPT;
use reqwest::StatusCode;
use serde_json::{Map, Value};
use tokio::sync::Mutex;

use crate::use_cases::ports::logger::Logger;
use crate::use_cases::ports::oidc_token_verifier::{OidcTokenVerifier, VerifiedOidcIdentity};

/// Google's published signing keys.
pub const GOOGLE_JWKS_URL: &str = "https://www.googleapis.com/oauth2/v3/certs";

/// Google issues both spellings of the issuer.
const ISSUERS: [&str; 2] = ["https://accounts.google.com", "accounts.google.com"];
const ALGORITHM: Algorithm = Algorithm::RS256;
const ALGORITHM_NAME: &str = "RS256";
const KEY_TYPE: &str = "RSA";

/// Key fetch failed, which is not the same as a bad token (JEF-356).
const JWKS_UNAVAILABLE_EVENT: &str = "oidc.jwks_unavailable";
const JWKS_UNAVAILABLE_MESSAGE: &str = "Could not fetch Google signing keys";

// The defaults of the `jose` remote key set `apps/api` uses.
/// How long a fetched key set is trusted before it is fetched again.
const CACHE_MAX_AGE: Duration = Duration::from_secs(10 * 60);
/// The least time between two fetches triggered by a token naming a key that
/// is not in the cached set, so a stream of junk `kid`s cannot hammer Google.
const COOLDOWN: Duration = Duration::from_secs(30);
const FETCH_TIMEOUT: Duration = Duration::from_secs(5);

/// Why the key set could not be obtained. None of these says anything about
/// the token being verified.
#[derive(Debug, thiserror::Error)]
enum JwksFetchError {
    /// The network failed or the request timed out.
    #[error("request for the JSON Web Key Set failed")]
    Request(#[source] reqwest::Error),
    #[error("Expected 200 OK from the JSON Web Key Set HTTP response, got {0}")]
    Status(u16),
    #[error("Failed to parse the JSON Web Key Set HTTP response as JSON")]
    NotJson(#[source] reqwest::Error),
    #[error("JSON Web Key Set malformed")]
    NotAKeySet,
}

struct CachedKeys {
    keys: Vec<Map<String, Value>>,
    fetched_at: Instant,
}

enum KeyMatch {
    One(DecodingKey),
    /// No key, several keys, or a key that cannot be used: the token is
    /// refused, and it is the token's problem, not the key set's.
    Unusable,
    NoneFound,
}

/// The keys `jose` would consider for an RS256 token with this `kid`.
fn select_key(keys: &[Map<String, Value>], kid: Option<&str>) -> KeyMatch {
    let text = |jwk: &Map<String, Value>, name: &str| -> Option<String> {
        jwk.get(name).and_then(Value::as_str).map(str::to_string)
    };
    let mut candidates = keys.iter().filter(|jwk| {
        text(jwk, "kty").as_deref() == Some(KEY_TYPE)
            && kid.is_none_or(|kid| text(jwk, "kid").as_deref() == Some(kid))
            && text(jwk, "alg").is_none_or(|alg| alg == ALGORITHM_NAME)
            && text(jwk, "use").is_none_or(|key_use| key_use == "sig")
            && jwk.get("key_ops").and_then(Value::as_array).is_none_or(|operations| {
                operations.iter().any(|operation| operation.as_str() == Some("verify"))
            })
    });

    let Some(jwk) = candidates.next() else {
        return KeyMatch::NoneFound;
    };
    if candidates.next().is_some() {
        return KeyMatch::Unusable;
    }
    let (Some(modulus), Some(exponent)) = (text(jwk, "n"), text(jwk, "e")) else {
        return KeyMatch::Unusable;
    };
    DecodingKey::from_rsa_components(&modulus, &exponent).map_or(KeyMatch::Unusable, KeyMatch::One)
}

/// Verifies Google-signed OIDC ID tokens, such as those Cloud Scheduler
/// attaches with `http_target.oidc_token` (infra/gcp/scheduler.tf).
///
/// The key set is fetched lazily and cached, and refetched when a token names
/// a key it has not seen, so Google's key rotation needs nothing from us.
pub struct GoogleOidcTokenVerifier {
    jwks_url: String,
    http: reqwest::Client,
    logger: Option<Arc<dyn Logger>>,
    cache: Mutex<Option<CachedKeys>>,
    cache_max_age: Duration,
    cooldown: Duration,
}

impl GoogleOidcTokenVerifier {
    /// `jwks_url` is [`GOOGLE_JWKS_URL`] outside tests.
    pub fn new(
        jwks_url: impl Into<String>,
        http: reqwest::Client,
        logger: Option<Arc<dyn Logger>>,
    ) -> Self {
        Self {
            jwks_url: jwks_url.into(),
            http,
            logger,
            cache: Mutex::new(None),
            cache_max_age: CACHE_MAX_AGE,
            cooldown: COOLDOWN,
        }
    }

    async fn fetch_keys(&self) -> Result<CachedKeys, JwksFetchError> {
        let response = self
            .http
            .get(&self.jwks_url)
            .header(ACCEPT, "application/json")
            .timeout(FETCH_TIMEOUT)
            .send()
            .await
            .map_err(JwksFetchError::Request)?;
        if response.status() != StatusCode::OK {
            return Err(JwksFetchError::Status(response.status().as_u16()));
        }
        let body: Value = response.json().await.map_err(|err| {
            if err.is_decode() {
                JwksFetchError::NotJson(err)
            } else {
                JwksFetchError::Request(err)
            }
        })?;

        let keys = body
            .get("keys")
            .and_then(Value::as_array)
            .and_then(|keys| {
                keys.iter().map(|key| key.as_object().cloned()).collect::<Option<Vec<_>>>()
            })
            .ok_or(JwksFetchError::NotAKeySet)?;
        Ok(CachedKeys { keys, fetched_at: Instant::now() })
    }

    /// The key that signed a token with this `kid`. `Err` only when the key
    /// set itself could not be obtained.
    async fn signing_key(&self, kid: Option<&str>) -> Result<Option<DecodingKey>, JwksFetchError> {
        let mut cache = self.cache.lock().await;

        let mut cached = match cache.take() {
            Some(cached) if cached.fetched_at.elapsed() < self.cache_max_age => cached,
            stale => match self.fetch_keys().await {
                Ok(fresh) => fresh,
                Err(err) => {
                    // A failed refresh leaves the old set in place for the retry.
                    *cache = stale;
                    return Err(err);
                }
            },
        };

        let mut found = select_key(&cached.keys, kid);
        if matches!(found, KeyMatch::NoneFound) && cached.fetched_at.elapsed() >= self.cooldown {
            // Possibly a key Google rotated in since the last fetch.
            match self.fetch_keys().await {
                Ok(fresh) => cached = fresh,
                Err(err) => {
                    *cache = Some(cached);
                    return Err(err);
                }
            }
            found = select_key(&cached.keys, kid);
        }
        *cache = Some(cached);

        Ok(match found {
            KeyMatch::One(key) => Some(key),
            KeyMatch::Unusable | KeyMatch::NoneFound => None,
        })
    }
}

#[async_trait]
impl OidcTokenVerifier for GoogleOidcTokenVerifier {
    async fn verify(&self, token: &str, audience: &str) -> Option<VerifiedOidcIdentity> {
        // Something that is not an RS256 JWT is refused before any key is
        // fetched, and silently: the cron route reports invalid tokens.
        let header = decode_header(token).ok()?;
        if header.alg != ALGORITHM {
            return None;
        }

        let key = match self.signing_key(header.kid.as_deref()).await {
            Ok(key) => key?,
            Err(err) => {
                // Every failure still means "refuse": the port has no other
                // answer. But a key fetch that failed says nothing about the
                // token, and would otherwise look exactly like a forged one
                // (JEF-356), so it is logged.
                if let Some(logger) = &self.logger {
                    logger.error(
                        JWKS_UNAVAILABLE_MESSAGE,
                        Some(&err),
                        &[("event", JWKS_UNAVAILABLE_EVENT.into())],
                    );
                }
                return None;
            }
        };

        let mut validation = Validation::new(ALGORITHM);
        // `jose` allows no clock skew unless asked to.
        validation.leeway = 0;
        validation.validate_nbf = true;
        validation.set_issuer(&ISSUERS);
        validation.set_audience(&[audience]);
        // As in `jose`: naming an issuer and an audience makes those claims
        // mandatory; `exp` is checked whenever it is present.
        validation.set_required_spec_claims(&["iss", "aud"]);
        let claims = decode::<Map<String, Value>>(token, &key, &validation).ok()?.claims;

        // `jose` treats a token as expired from the second `exp` names, one
        // second earlier than the check above.
        if let Some(expires_at) = claims.get("exp") {
            #[allow(clippy::cast_precision_loss)]
            let now = Utc::now().timestamp() as f64;
            if expires_at.as_f64()? <= now {
                return None;
            }
        }

        // An unverified email is only a claim; the invoker check keys on it.
        let email = claims.get("email")?.as_str()?;
        if claims.get("email_verified") != Some(&Value::Bool(true)) {
            return None;
        }
        Some(VerifiedOidcIdentity { email: email.to_string() })
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Mutex as StdMutex, OnceLock};

    use axum::extract::State;
    use axum::http::StatusCode as AxumStatus;
    use axum::response::{IntoResponse, Response};
    use axum::routing::get;
    use axum::{Json, Router};
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;
    use jsonwebtoken::{encode, EncodingKey, Header};
    use rsa::pkcs1::{EncodeRsaPrivateKey, LineEnding};
    use rsa::traits::PublicKeyParts;
    use rsa::RsaPrivateKey;
    use serde_json::json;

    use super::*;
    use crate::infrastructure::auth::oauth_http::test_support::serve;
    use crate::use_cases::ports::logger::LogValue;
    use crate::use_cases::test_support::{FakeLogger, LogLevel};

    const AUDIENCE: &str = "https://api.example.com";
    const INVOKER: &str = "cron-invoker@project.iam.gserviceaccount.com";
    const KID: &str = "test-key";
    const ISSUER: &str = "https://accounts.google.com";

    /// An RSA key pair generated for this test run, standing in for Google's.
    struct TestKey {
        encoding: EncodingKey,
        jwk: Value,
    }

    impl TestKey {
        fn generate(kid: &str) -> Self {
            let private = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).unwrap();
            let pem = private.to_pkcs1_pem(LineEnding::LF).unwrap();
            let jwk = json!({
                "kty": "RSA",
                "kid": kid,
                "alg": "RS256",
                "use": "sig",
                "n": URL_SAFE_NO_PAD.encode(private.n().to_bytes_be()),
                "e": URL_SAFE_NO_PAD.encode(private.e().to_bytes_be()),
            });
            Self { encoding: EncodingKey::from_rsa_pem(pem.as_bytes()).unwrap(), jwk }
        }

        fn sign_with(&self, kid: Option<&str>, claims: &Value) -> String {
            let mut header = Header::new(Algorithm::RS256);
            header.kid = kid.map(str::to_string);
            encode(&header, claims, &self.encoding).unwrap()
        }

        fn sign(&self, claims: &Value) -> String {
            self.sign_with(Some(KID), claims)
        }
    }

    /// Generating a key is slow in a debug build, so the suite shares two.
    fn google() -> &'static TestKey {
        static KEY: OnceLock<TestKey> = OnceLock::new();
        KEY.get_or_init(|| TestKey::generate(KID))
    }

    fn impostor() -> &'static TestKey {
        static KEY: OnceLock<TestKey> = OnceLock::new();
        KEY.get_or_init(|| TestKey::generate(KID))
    }

    /// Claims shaped like the ones Cloud Scheduler sends, with `overrides`
    /// merged over them (`null` removes a claim).
    fn claims(overrides: Value) -> Value {
        let now = Utc::now().timestamp();
        let mut claims = json!({
            "email": INVOKER,
            "email_verified": true,
            "iss": ISSUER,
            "aud": AUDIENCE,
            "sub": "1234567890",
            "iat": now - 60,
            "exp": now + 3600,
        });
        for (name, value) in overrides.as_object().unwrap() {
            if value.is_null() {
                claims.as_object_mut().unwrap().remove(name);
            } else {
                claims[name] = value.clone();
            }
        }
        claims
    }

    fn valid_token() -> String {
        google().sign(&claims(json!({})))
    }

    /// What the stub JWKS endpoint answers with.
    #[derive(Clone)]
    enum Answer {
        Body(Value),
        Status(AxumStatus),
        Text(&'static str),
    }

    #[derive(Clone)]
    struct Stub {
        answer: Arc<StdMutex<Answer>>,
        hits: Arc<AtomicUsize>,
    }

    impl Stub {
        async fn start(answer: Answer) -> (Self, String) {
            let stub = Self { answer: Arc::new(StdMutex::new(answer)), hits: Arc::default() };
            let router = Router::new()
                .route(
                    "/certs",
                    get(|State(stub): State<Stub>| async move {
                        stub.hits.fetch_add(1, Ordering::SeqCst);
                        let answer = stub.answer.lock().unwrap().clone();
                        match answer {
                            Answer::Body(body) => Json(body).into_response(),
                            Answer::Status(status) => (status, "upstream down").into_response(),
                            Answer::Text(text) => Response::new(text.into()),
                        }
                    }),
                )
                .with_state(stub.clone());
            let url = format!("{}/certs", serve(router).await);
            (stub, url)
        }

        fn set(&self, answer: Answer) {
            *self.answer.lock().unwrap() = answer;
        }

        fn hits(&self) -> usize {
            self.hits.load(Ordering::SeqCst)
        }
    }

    fn key_set(keys: &[&TestKey]) -> Answer {
        Answer::Body(json!({ "keys": keys.iter().map(|key| key.jwk.clone()).collect::<Vec<_>>() }))
    }

    struct Harness {
        verifier: GoogleOidcTokenVerifier,
        logger: Arc<FakeLogger>,
        stub: Stub,
    }

    impl Harness {
        async fn serving(answer: Answer) -> Self {
            let (stub, url) = Stub::start(answer).await;
            let logger = Arc::new(FakeLogger::default());
            let verifier = GoogleOidcTokenVerifier::new(
                url,
                reqwest::Client::new(),
                Some(Arc::clone(&logger) as Arc<dyn Logger>),
            );
            Self { verifier, logger, stub }
        }

        async fn google() -> Self {
            Self::serving(key_set(&[google()])).await
        }

        async fn verify(&self, token: &str) -> Option<VerifiedOidcIdentity> {
            self.verifier.verify(token, AUDIENCE).await
        }

        fn assert_logged_jwks_unavailable(&self) {
            let lines = self.logger.lines();
            assert_eq!(lines.len(), 1, "{lines:?}");
            assert_eq!(lines[0].level, LogLevel::Error);
            assert_eq!(lines[0].message, "Could not fetch Google signing keys");
            assert!(lines[0].error.is_some());
            assert_eq!(
                lines[0].field("event"),
                Some(&LogValue::Str("oidc.jwks_unavailable".to_string()))
            );
        }
    }

    fn identity() -> Option<VerifiedOidcIdentity> {
        Some(VerifiedOidcIdentity { email: INVOKER.to_string() })
    }

    #[tokio::test]
    async fn returns_the_email_of_a_valid_token() {
        let harness = Harness::google().await;

        assert_eq!(harness.verify(&valid_token()).await, identity());
        assert!(harness.logger.lines().is_empty());
    }

    #[tokio::test]
    async fn accepts_the_issuer_without_a_scheme_which_google_also_uses() {
        let harness = Harness::google().await;
        let token = google().sign(&claims(json!({ "iss": "accounts.google.com" })));

        assert_eq!(harness.verify(&token).await, identity());
    }

    #[tokio::test]
    async fn accepts_an_audience_listed_among_several() {
        let harness = Harness::google().await;
        let token =
            google().sign(&claims(json!({ "aud": ["https://other.example.com", AUDIENCE] })));

        assert_eq!(harness.verify(&token).await, identity());
    }

    #[tokio::test]
    async fn refuses_a_token_minted_for_a_different_audience() {
        let harness = Harness::google().await;
        let token = google().sign(&claims(json!({ "aud": "https://other.example.com" })));

        assert_eq!(harness.verify(&token).await, None);
    }

    #[tokio::test]
    async fn refuses_a_token_with_no_audience_or_no_issuer() {
        let harness = Harness::google().await;

        assert_eq!(harness.verify(&google().sign(&claims(json!({ "aud": null })))).await, None);
        assert_eq!(harness.verify(&google().sign(&claims(json!({ "iss": null })))).await, None);
    }

    #[tokio::test]
    async fn refuses_an_expired_token() {
        let harness = Harness::google().await;
        let now = Utc::now().timestamp();

        let token = google().sign(&claims(json!({ "exp": now - 3600 })));
        assert_eq!(harness.verify(&token).await, None);
        // No leeway: a token that expired a few seconds ago is expired.
        let token = google().sign(&claims(json!({ "exp": now - 5 })));
        assert_eq!(harness.verify(&token).await, None);
    }

    #[tokio::test]
    async fn refuses_a_token_that_is_not_valid_yet() {
        let harness = Harness::google().await;
        let token = google().sign(&claims(json!({ "nbf": Utc::now().timestamp() + 3600 })));

        assert_eq!(harness.verify(&token).await, None);
    }

    #[tokio::test]
    async fn refuses_a_token_from_another_issuer() {
        let harness = Harness::google().await;
        let token = google().sign(&claims(json!({ "iss": "https://evil.example.com" })));

        assert_eq!(harness.verify(&token).await, None);
    }

    #[tokio::test]
    async fn refuses_a_token_signed_by_a_key_outside_the_key_set() {
        let harness = Harness::google().await;
        // Same `kid`, different key: the signature is what fails.
        let token = impostor().sign(&claims(json!({})));

        assert_eq!(harness.verify(&token).await, None);
    }

    #[tokio::test]
    async fn refuses_a_token_whose_payload_was_edited_after_signing() {
        let harness = Harness::google().await;
        let token = google().sign(&claims(json!({ "email": "someone-else@example.com" })));
        let genuine = valid_token();
        let (signed_part, _) = token.rsplit_once('.').unwrap();
        let (_, genuine_signature) = genuine.rsplit_once('.').unwrap();

        assert_eq!(harness.verify(&format!("{signed_part}.{genuine_signature}")).await, None);
    }

    #[tokio::test]
    async fn refuses_a_token_whose_email_is_not_verified() {
        let harness = Harness::google().await;

        for unverified in [json!(false), json!("true"), json!(1), Value::Null] {
            let token = google().sign(&claims(json!({ "email_verified": unverified })));
            assert_eq!(harness.verify(&token).await, None);
        }
    }

    #[tokio::test]
    async fn refuses_a_token_with_no_email_claim() {
        let harness = Harness::google().await;

        assert_eq!(harness.verify(&google().sign(&claims(json!({ "email": null })))).await, None);
        assert_eq!(harness.verify(&google().sign(&claims(json!({ "email": 42 })))).await, None);
    }

    #[tokio::test]
    async fn refuses_something_that_is_not_a_jwt_without_fetching_any_key() {
        let harness = Harness::google().await;

        assert_eq!(harness.verify("a-shared-secret").await, None);
        assert_eq!(harness.verify("").await, None);
        assert_eq!(harness.verify("a.b.c").await, None);
        assert_eq!(harness.stub.hits(), 0);
    }

    #[tokio::test]
    async fn refuses_a_token_signed_with_another_algorithm_without_fetching_any_key() {
        let harness = Harness::google().await;
        // An HS256 token keyed with the public modulus: the classic
        // algorithm-confusion forgery.
        let secret = google().jwk["n"].as_str().unwrap().as_bytes();
        let token = encode(
            &Header::new(Algorithm::HS256),
            &claims(json!({})),
            &EncodingKey::from_secret(secret),
        )
        .unwrap();

        assert_eq!(harness.verify(&token).await, None);
        assert_eq!(harness.stub.hits(), 0);
    }

    #[tokio::test]
    async fn uses_the_only_suitable_key_for_a_token_that_names_none() {
        let harness = Harness::google().await;
        let token = google().sign_with(None, &claims(json!({})));

        assert_eq!(harness.verify(&token).await, identity());
    }

    #[tokio::test]
    async fn refuses_when_several_keys_could_have_signed_the_token() {
        // Two keys under one `kid`: `jose` refuses to guess.
        let harness = Harness::serving(key_set(&[google(), impostor()])).await;

        assert_eq!(harness.verify(&valid_token()).await, None);
        assert!(harness.logger.lines().is_empty());
    }

    #[tokio::test]
    async fn ignores_keys_that_are_not_for_verifying_rs256_signatures() {
        let mut encryption_key = google().jwk.clone();
        encryption_key["use"] = json!("enc");
        let mut other_algorithm = google().jwk.clone();
        other_algorithm["alg"] = json!("RS512");
        let mut signing_only = google().jwk.clone();
        signing_only["key_ops"] = json!(["sign"]);

        for unsuitable in [encryption_key, other_algorithm, signing_only] {
            let harness = Harness::serving(Answer::Body(json!({ "keys": [unsuitable] }))).await;
            assert_eq!(harness.verify(&valid_token()).await, None);
            assert!(harness.logger.lines().is_empty());
        }
    }

    #[tokio::test]
    async fn fetches_the_key_set_once_and_reuses_it() {
        let harness = Harness::google().await;

        for _ in 0..3 {
            assert_eq!(harness.verify(&valid_token()).await, identity());
        }
        assert_eq!(harness.stub.hits(), 1);
    }

    #[tokio::test]
    async fn an_unknown_key_id_does_not_refetch_during_the_cooldown() {
        let harness = Harness::google().await;
        let token = google().sign_with(Some("rotated-key"), &claims(json!({})));

        assert_eq!(harness.verify(&token).await, None);
        assert_eq!(harness.verify(&token).await, None);

        assert_eq!(harness.stub.hits(), 1);
        assert!(harness.logger.lines().is_empty());
    }

    #[tokio::test]
    async fn refetches_for_an_unknown_key_id_once_the_cooldown_has_passed() {
        // Google rotates its keys: a token signed with the new one arrives
        // while the old set is still cached.
        let mut harness = Harness::serving(key_set(&[impostor()])).await;
        harness.verifier.cooldown = Duration::ZERO;
        let rotated = TestKey { encoding: google().encoding.clone(), jwk: google().jwk.clone() };
        let mut rotated_jwk = rotated.jwk.clone();
        rotated_jwk["kid"] = json!("rotated-key");
        let token = rotated.sign_with(Some("rotated-key"), &claims(json!({})));

        assert_eq!(harness.verify(&token).await, None);
        harness.stub.set(Answer::Body(json!({ "keys": [impostor().jwk, rotated_jwk] })));

        assert_eq!(harness.verify(&token).await, identity());
    }

    #[tokio::test]
    async fn fetches_again_once_the_cached_key_set_is_too_old() {
        let mut harness = Harness::google().await;
        harness.verifier.cache_max_age = Duration::ZERO;

        assert_eq!(harness.verify(&valid_token()).await, identity());
        assert_eq!(harness.verify(&valid_token()).await, identity());

        assert_eq!(harness.stub.hits(), 2);
    }

    // ----- key fetch failures (JEF-356) ----------------------------------

    #[tokio::test]
    async fn refuses_and_logs_when_the_endpoint_answers_with_an_error_status() {
        let harness = Harness::serving(Answer::Status(AxumStatus::INTERNAL_SERVER_ERROR)).await;

        assert_eq!(harness.verify(&valid_token()).await, None);
        harness.assert_logged_jwks_unavailable();
    }

    #[tokio::test]
    async fn refuses_and_logs_on_any_status_but_200() {
        let harness = Harness::serving(Answer::Status(AxumStatus::NO_CONTENT)).await;

        assert_eq!(harness.verify(&valid_token()).await, None);
        harness.assert_logged_jwks_unavailable();
    }

    #[tokio::test]
    async fn refuses_and_logs_when_the_response_is_not_json() {
        let harness = Harness::serving(Answer::Text("<html>maintenance</html>")).await;

        assert_eq!(harness.verify(&valid_token()).await, None);
        harness.assert_logged_jwks_unavailable();
    }

    #[tokio::test]
    async fn refuses_and_logs_when_the_response_is_not_a_key_set() {
        for body in [json!({ "error": "nope" }), json!({ "keys": "none" }), json!({ "keys": [1] })]
        {
            let harness = Harness::serving(Answer::Body(body)).await;

            assert_eq!(harness.verify(&valid_token()).await, None);
            harness.assert_logged_jwks_unavailable();
        }
    }

    #[tokio::test]
    async fn refuses_and_logs_when_nothing_is_listening() {
        let logger = Arc::new(FakeLogger::default());
        let verifier = GoogleOidcTokenVerifier::new(
            "http://127.0.0.1:1/certs",
            reqwest::Client::new(),
            Some(Arc::clone(&logger) as Arc<dyn Logger>),
        );

        assert_eq!(verifier.verify(&valid_token(), AUDIENCE).await, None);

        let lines = logger.lines();
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].field("event"), Some(&LogValue::Str("oidc.jwks_unavailable".into())));
    }

    #[tokio::test]
    async fn refuses_without_a_logger_when_the_keys_cannot_be_fetched() {
        let verifier =
            GoogleOidcTokenVerifier::new("http://127.0.0.1:1/certs", reqwest::Client::new(), None);

        assert_eq!(verifier.verify(&valid_token(), AUDIENCE).await, None);
    }

    #[tokio::test]
    async fn recovers_once_the_endpoint_is_back() {
        let harness = Harness::serving(Answer::Status(AxumStatus::BAD_GATEWAY)).await;
        assert_eq!(harness.verify(&valid_token()).await, None);

        harness.stub.set(key_set(&[google()]));

        assert_eq!(harness.verify(&valid_token()).await, identity());
        assert_eq!(harness.logger.lines().len(), 1);
    }

    #[tokio::test]
    async fn keeps_the_cached_keys_when_a_refresh_fails() {
        let mut harness = Harness::google().await;
        assert_eq!(harness.verify(&valid_token()).await, identity());

        // The cache has aged out and Google is down: this request is refused
        // and the outage logged...
        harness.verifier.cache_max_age = Duration::ZERO;
        harness.stub.set(Answer::Status(AxumStatus::SERVICE_UNAVAILABLE));
        assert_eq!(harness.verify(&valid_token()).await, None);
        harness.assert_logged_jwks_unavailable();

        // ...and the next one is served once the endpoint answers again.
        harness.stub.set(key_set(&[google()]));
        assert_eq!(harness.verify(&valid_token()).await, identity());
    }

    #[tokio::test]
    async fn stays_silent_for_every_kind_of_invalid_token() {
        let harness = Harness::google().await;
        let now = Utc::now().timestamp();

        harness.verify("a-shared-secret").await;
        harness.verify(&impostor().sign(&claims(json!({})))).await;
        harness
            .verify(&google().sign(&claims(json!({ "aud": "https://other.example.com" }))))
            .await;
        harness.verify(&google().sign(&claims(json!({ "exp": now - 3600 })))).await;
        harness.verify(&google().sign_with(Some("unknown-key"), &claims(json!({})))).await;

        assert!(harness.logger.lines().is_empty());
    }
}
