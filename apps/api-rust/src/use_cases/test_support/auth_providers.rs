use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use async_trait::async_trait;

use crate::domain::oauth_account::OAuthProviderName;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::llm_api_key_cipher::LlmApiKeyCipher;
use crate::use_cases::ports::mobile_oauth_handoff_service::{
    MobileOAuthHandoffService, MobileOAuthTokens,
};
use crate::use_cases::ports::oauth_provider::{OAuthProfile, OAuthProvider};
use crate::use_cases::ports::oauth_provider_registry::OAuthProviderRegistry;
use crate::use_cases::ports::oidc_token_verifier::{OidcTokenVerifier, VerifiedOidcIdentity};
use crate::use_cases::ports::totp_provider::TotpProvider;

const FAKE_ENCRYPTED_PREFIX: &str = "fake-encrypted:";
const FAKE_SEALED_PREFIX: &str = "fake-sealed[";
const FAKE_CODE_LENGTH: usize = 6;

/// Secrets `FAKESECRET1`, `FAKESECRET2`, … in call order; "encryption" is a
/// visible prefix; a code is valid when it was registered for that secret.
#[derive(Default)]
pub struct FakeTotpProvider {
    generated: AtomicUsize,
    valid_codes: Mutex<HashMap<String, String>>,
}

impl FakeTotpProvider {
    /// Makes `code` the one valid code for `secret`.
    pub fn with_valid_code(self, secret: &str, code: &str) -> Self {
        self.set_valid_code(secret, code);
        self
    }

    pub fn set_valid_code(&self, secret: &str, code: &str) {
        self.valid_codes.lock().unwrap().insert(secret.to_string(), code.to_string());
    }
}

impl TotpProvider for FakeTotpProvider {
    fn generate_secret(&self) -> String {
        format!("FAKESECRET{}", self.generated.fetch_add(1, Ordering::SeqCst) + 1)
    }

    fn get_otpauth_url(&self, secret: &str, label: &str) -> DomainResult<String> {
        Ok(format!("otpauth://totp/Fake:{label}?secret={secret}&issuer=Fake"))
    }

    fn verify_code(&self, secret: &str, code: &str) -> DomainResult<bool> {
        // The real provider fails, rather than answering "no", for a code
        // that is not six digits; a use case must not rely on it answering.
        if code.len() != FAKE_CODE_LENGTH || !code.bytes().all(|b| b.is_ascii_digit()) {
            return Err(DomainError::internal(format!("Token must be 6 digits, got {code:?}")));
        }
        Ok(self.valid_codes.lock().unwrap().get(secret).is_some_and(|valid| valid == code))
    }

    fn encrypt_secret(&self, secret: &str) -> DomainResult<String> {
        Ok(format!("{FAKE_ENCRYPTED_PREFIX}{secret}"))
    }

    fn decrypt_secret(&self, encrypted_secret: &str) -> DomainResult<String> {
        encrypted_secret
            .strip_prefix(FAKE_ENCRYPTED_PREFIX)
            .map(str::to_string)
            .ok_or_else(|| DomainError::internal("not a secret this fake encrypted"))
    }
}

/// One code exchange a [`FakeOAuthProvider`] was asked to make.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OAuthExchange {
    pub code: String,
    pub redirect_uri: String,
    pub code_verifier: String,
}

/// Exchanges only the codes it was told about, and remembers every attempt.
#[derive(Default)]
pub struct FakeOAuthProvider {
    profiles: Mutex<HashMap<String, OAuthProfile>>,
    exchanges: Mutex<Vec<OAuthExchange>>,
}

impl FakeOAuthProvider {
    pub fn with_profile(self, code: &str, profile: OAuthProfile) -> Self {
        self.profiles.lock().unwrap().insert(code.to_string(), profile);
        self
    }

    pub fn exchanges(&self) -> Vec<OAuthExchange> {
        self.exchanges.lock().unwrap().clone()
    }
}

#[async_trait]
impl OAuthProvider for FakeOAuthProvider {
    fn get_authorization_url(
        &self,
        state: &str,
        redirect_uri: &str,
        code_challenge: &str,
    ) -> String {
        format!(
            "https://fake-provider.test/authorize?state={state}&redirect_uri={redirect_uri}&code_challenge={code_challenge}"
        )
    }

    async fn exchange_code_for_profile(
        &self,
        code: &str,
        redirect_uri: &str,
        code_verifier: &str,
    ) -> DomainResult<OAuthProfile> {
        self.exchanges.lock().unwrap().push(OAuthExchange {
            code: code.to_string(),
            redirect_uri: redirect_uri.to_string(),
            code_verifier: code_verifier.to_string(),
        });
        self.profiles
            .lock()
            .unwrap()
            .get(code)
            .cloned()
            .ok_or_else(|| DomainError::internal("fake provider: token exchange failed"))
    }
}

/// A [`FakeOAuthProvider`] per provider name.
#[derive(Default)]
pub struct FakeOAuthProviderRegistry {
    pub google: Arc<FakeOAuthProvider>,
    pub github: Arc<FakeOAuthProvider>,
}

impl FakeOAuthProviderRegistry {
    pub fn new(google: FakeOAuthProvider, github: FakeOAuthProvider) -> Self {
        Self { google: Arc::new(google), github: Arc::new(github) }
    }
}

impl OAuthProviderRegistry for FakeOAuthProviderRegistry {
    fn get(&self, provider: OAuthProviderName) -> Arc<dyn OAuthProvider> {
        match provider {
            OAuthProviderName::Google => Arc::clone(&self.google) as Arc<dyn OAuthProvider>,
            OAuthProviderName::Github => Arc::clone(&self.github) as Arc<dyn OAuthProvider>,
        }
    }
}

/// Verifies only the tokens it was told about, for the audience each was minted for.
#[derive(Default)]
pub struct FakeOidcTokenVerifier {
    tokens: HashMap<String, (String, String)>,
}

impl FakeOidcTokenVerifier {
    pub fn with_token(mut self, token: &str, audience: &str, email: &str) -> Self {
        self.tokens.insert(token.to_string(), (audience.to_string(), email.to_string()));
        self
    }
}

#[async_trait]
impl OidcTokenVerifier for FakeOidcTokenVerifier {
    async fn verify(&self, token: &str, audience: &str) -> Option<VerifiedOidcIdentity> {
        let (expected_audience, email) = self.tokens.get(token)?;
        (expected_audience == audience).then(|| VerifiedOidcIdentity { email: email.clone() })
    }
}

/// Redeems only the codes it was told about, and only with their verifier.
#[derive(Default)]
pub struct FakeMobileOAuthHandoffService {
    codes: HashMap<String, (String, MobileOAuthTokens)>,
}

impl FakeMobileOAuthHandoffService {
    pub fn with_code(mut self, code: &str, code_verifier: &str, tokens: MobileOAuthTokens) -> Self {
        self.codes.insert(code.to_string(), (code_verifier.to_string(), tokens));
        self
    }
}

impl MobileOAuthHandoffService for FakeMobileOAuthHandoffService {
    fn verify(&self, code: &str, code_verifier: &str) -> DomainResult<MobileOAuthTokens> {
        match self.codes.get(code) {
            Some((expected_verifier, tokens)) if expected_verifier == code_verifier => {
                Ok(tokens.clone())
            }
            Some(_) => Err(DomainError::internal("Invalid OAuth handoff PKCE verifier")),
            None => Err(DomainError::internal("Invalid OAuth handoff code signature")),
        }
    }
}

/// Reverses the plaintext and labels it with the context: obviously not
/// encryption, reversible, and (like the real cipher) refuses a value read
/// back under a different context.
#[derive(Default)]
pub struct FakeLlmApiKeyCipher;

impl LlmApiKeyCipher for FakeLlmApiKeyCipher {
    fn encrypt(&self, plaintext: &str, context: &str) -> DomainResult<String> {
        let reversed: String = plaintext.chars().rev().collect();
        Ok(format!("{FAKE_SEALED_PREFIX}{context}]:{reversed}"))
    }

    fn decrypt(&self, ciphertext: &str, context: &str) -> DomainResult<String> {
        ciphertext
            .strip_prefix(FAKE_SEALED_PREFIX)
            .and_then(|rest| rest.strip_prefix(context))
            .and_then(|rest| rest.strip_prefix("]:"))
            .map(|reversed| reversed.chars().rev().collect())
            .ok_or_else(|| DomainError::internal("unable to authenticate data"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile() -> OAuthProfile {
        OAuthProfile {
            provider_account_id: "account-1".to_string(),
            email: Some("a@example.com".to_string()),
            email_verified: true,
            name: None,
        }
    }

    #[test]
    fn the_totp_fake_generates_distinct_secrets_and_round_trips_encryption() {
        let totp = FakeTotpProvider::default();

        let first = totp.generate_secret();
        assert_ne!(first, totp.generate_secret());
        let encrypted = totp.encrypt_secret(&first).unwrap();
        assert_ne!(encrypted, first);
        assert_eq!(totp.decrypt_secret(&encrypted).unwrap(), first);
        assert!(totp.decrypt_secret("something else").is_err());
        assert!(totp.get_otpauth_url(&first, "a@example.com").unwrap().contains("a@example.com"));
    }

    #[test]
    fn the_totp_fake_accepts_only_the_registered_code() {
        let totp = FakeTotpProvider::default().with_valid_code("SECRET", "123456");

        assert!(totp.verify_code("SECRET", "123456").unwrap());
        assert!(!totp.verify_code("SECRET", "654321").unwrap());
        assert!(!totp.verify_code("OTHER", "123456").unwrap());
        assert!(totp.verify_code("SECRET", "12345").is_err());
        assert!(totp.verify_code("SECRET", "abcdef").is_err());
    }

    #[tokio::test]
    async fn the_oauth_fake_exchanges_known_codes_and_records_attempts() {
        let registry = FakeOAuthProviderRegistry::new(
            FakeOAuthProvider::default().with_profile("good-code", profile()),
            FakeOAuthProvider::default(),
        );

        let google = registry.get(OAuthProviderName::Google);
        assert_eq!(
            google.exchange_code_for_profile("good-code", "cb", "v").await.unwrap(),
            profile()
        );
        assert!(google.exchange_code_for_profile("bad-code", "cb", "v").await.is_err());
        let github = registry.get(OAuthProviderName::Github);
        assert!(github.exchange_code_for_profile("good-code", "cb", "v").await.is_err());

        assert_eq!(registry.google.exchanges().len(), 2);
        assert_eq!(
            registry.github.exchanges(),
            vec![OAuthExchange {
                code: "good-code".to_string(),
                redirect_uri: "cb".to_string(),
                code_verifier: "v".to_string(),
            }]
        );
        assert!(google.get_authorization_url("s", "cb", "c").contains("state=s"));
    }

    #[tokio::test]
    async fn the_oidc_fake_checks_the_audience() {
        let verifier =
            FakeOidcTokenVerifier::default().with_token("tok", "https://api", "cron@example.com");

        assert_eq!(
            verifier.verify("tok", "https://api").await,
            Some(VerifiedOidcIdentity { email: "cron@example.com".to_string() })
        );
        assert_eq!(verifier.verify("tok", "https://other").await, None);
        assert_eq!(verifier.verify("unknown", "https://api").await, None);
    }

    #[test]
    fn the_handoff_fake_needs_the_matching_verifier() {
        let tokens = MobileOAuthTokens {
            access_token: "access".to_string(),
            refresh_token: "refresh".to_string(),
        };
        let handoff =
            FakeMobileOAuthHandoffService::default().with_code("code", "verifier", tokens.clone());

        assert_eq!(handoff.verify("code", "verifier").unwrap(), tokens);
        assert!(handoff.verify("code", "wrong").is_err());
        assert!(handoff.verify("unknown", "verifier").is_err());
    }

    #[test]
    fn the_cipher_fake_is_reversible_and_bound_to_its_context() {
        let cipher = FakeLlmApiKeyCipher;

        let sealed = cipher.encrypt("sk-abc", "user-1:openai").unwrap();
        assert_eq!(sealed, "fake-sealed[user-1:openai]:cba-ks");
        assert_eq!(cipher.decrypt(&sealed, "user-1:openai").unwrap(), "sk-abc");
        assert!(cipher.decrypt(&sealed, "user-2:openai").is_err());
        assert!(cipher.decrypt("v1:real-looking", "user-1:openai").is_err());
    }
}
