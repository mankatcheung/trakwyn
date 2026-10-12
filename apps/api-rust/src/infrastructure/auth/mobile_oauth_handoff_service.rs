use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::infrastructure::auth::encoding::{
    base64url, constant_time_eq, decode_base64_lenient, hmac_sha256_base64url, split_signed,
};
use crate::infrastructure::auth::pkce::{derive_code_challenge, is_well_formed_pkce_value};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::mobile_oauth_handoff_service::{
    MobileOAuthHandoffService, MobileOAuthTokens,
};

/// How long a mobile login's handoff code stays valid, in milliseconds
/// (JEF-275). It carries the finished session's tokens from the OAuth callback
/// (a browser redirect) to the app (a GraphQL mutation) across the
/// custom-scheme handoff, so it only needs to survive that one immediate
/// round-trip: short on purpose, unlike the state TTL, which spans the whole
/// provider detour.
pub const MOBILE_HANDOFF_TTL_MS: i64 = 60 * 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum MobileOAuthHandoffError {
    #[error("Malformed OAuth handoff code")]
    Malformed,
    #[error("Invalid OAuth handoff code signature")]
    InvalidSignature,
    #[error("OAuth handoff code expired")]
    Expired,
    #[error("Invalid OAuth handoff PKCE verifier")]
    InvalidPkceVerifier,
}

/// The JSON `apps/api` signs, keys in its order.
#[derive(Serialize, Deserialize)]
struct Payload {
    #[serde(rename = "accessToken")]
    access_token: String,
    #[serde(rename = "refreshToken")]
    refresh_token: String,
    exp: i64,
    #[serde(rename = "codeChallenge")]
    code_challenge: String,
}

fn matches_pkce(verifier: &str, expected_challenge: &str) -> bool {
    constant_time_eq(derive_code_challenge(verifier).as_bytes(), expected_challenge.as_bytes())
}

/// Carries a finished mobile OAuth login's tokens across the one hop the API
/// cannot control: the custom-scheme redirect from the system browser back
/// into the app (JEF-275). The callback mints one of these instead of setting
/// cookies (React Native has no cookie jar tied to the API); the app's
/// `exchangeMobileOAuthCode` mutation redeems it for the real tokens.
///
/// Stateless (HMAC over the payload, reusing `JWT_SECRET`) rather than a cache
/// entry, matching [`super::OAuthStateService`], and deliberately short-lived
/// since redemption happens moments after issue. Not single-use: a code that
/// leaks is exactly as dangerous as the tokens it carries, but only for the
/// ~60 seconds it's valid, which is the same exposure window a raw
/// token-bearing redirect URL would have.
///
/// PKCE-bound on top of that: the custom-scheme redirect this code travels
/// through is OS-mediated, not API-mediated, so another app registering the
/// same `trakwyn://` scheme could in principle intercept it (the RFC 8252
/// native-app threat PKCE exists for). Binding the code to a `code_challenge`
/// the app chose *before* opening the browser means an interceptor holding
/// only the code, not the verifier the legitimate app kept in memory, still
/// cannot redeem it.
pub struct HmacMobileOAuthHandoffService {
    secret: String,
}

impl HmacMobileOAuthHandoffService {
    /// `secret` is `JWT_SECRET`.
    pub fn new(secret: impl Into<String>) -> Self {
        Self { secret: secret.into() }
    }

    pub fn issue(&self, access_token: &str, refresh_token: &str, code_challenge: &str) -> String {
        self.issue_at(access_token, refresh_token, code_challenge, Utc::now().timestamp_millis())
    }

    fn issue_at(
        &self,
        access_token: &str,
        refresh_token: &str,
        code_challenge: &str,
        now_ms: i64,
    ) -> String {
        let payload = Payload {
            access_token: access_token.to_string(),
            refresh_token: refresh_token.to_string(),
            exp: now_ms + MOBILE_HANDOFF_TTL_MS,
            code_challenge: code_challenge.to_string(),
        };
        // Serialising a struct of strings and an integer cannot fail.
        let encoded = base64url(serde_json::to_vec(&payload).unwrap_or_default());
        let signature = hmac_sha256_base64url(&self.secret, &encoded);
        format!("{encoded}.{signature}")
    }

    fn verify_at(
        &self,
        code: &str,
        code_verifier: &str,
        now_ms: i64,
    ) -> Result<MobileOAuthTokens, MobileOAuthHandoffError> {
        let (encoded, signature) = split_signed(code).ok_or(MobileOAuthHandoffError::Malformed)?;
        let expected = hmac_sha256_base64url(&self.secret, encoded);
        if !constant_time_eq(signature.as_bytes(), expected.as_bytes()) {
            return Err(MobileOAuthHandoffError::InvalidSignature);
        }

        let payload: Payload = serde_json::from_slice(&decode_base64_lenient(encoded))
            .map_err(|_| MobileOAuthHandoffError::Malformed)?;
        if payload.exp < now_ms {
            return Err(MobileOAuthHandoffError::Expired);
        }
        if !is_well_formed_pkce_value(code_verifier)
            || !matches_pkce(code_verifier, &payload.code_challenge)
        {
            return Err(MobileOAuthHandoffError::InvalidPkceVerifier);
        }
        Ok(MobileOAuthTokens {
            access_token: payload.access_token,
            refresh_token: payload.refresh_token,
        })
    }
}

impl MobileOAuthHandoffService for HmacMobileOAuthHandoffService {
    fn verify(&self, code: &str, code_verifier: &str) -> DomainResult<MobileOAuthTokens> {
        self.verify_at(code, code_verifier, Utc::now().timestamp_millis())
            .map_err(DomainError::internal)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::auth::pkce::create_pkce_pair;
    use crate::use_cases::errors::ErrorCode;

    fn service() -> HmacMobileOAuthHandoffService {
        HmacMobileOAuthHandoffService::new("test-secret")
    }

    #[test]
    fn round_trips_the_tokens_given_the_matching_pkce_verifier() {
        let service = service();
        let pair = create_pkce_pair();
        let code = service.issue("access-1", "refresh-1", &pair.challenge);

        let tokens = service.verify(&code, &pair.verifier).unwrap();

        assert_eq!(tokens.access_token, "access-1");
        assert_eq!(tokens.refresh_token, "refresh-1");
    }

    #[test]
    fn fails_on_a_tampered_signature() {
        let service = service();
        let pair = create_pkce_pair();
        let code = service.issue("access-1", "refresh-1", &pair.challenge);
        let payload = code.split('.').next().unwrap();

        let err = service
            .verify_at(&format!("{payload}.tampered-signature"), &pair.verifier, 0)
            .unwrap_err();
        assert_eq!(err, MobileOAuthHandoffError::InvalidSignature);
        assert_eq!(err.to_string(), "Invalid OAuth handoff code signature");
    }

    #[test]
    fn fails_on_a_code_signed_with_another_secret() {
        let pair = create_pkce_pair();
        let code = HmacMobileOAuthHandoffService::new("someone-elses-secret").issue(
            "access-1",
            "refresh-1",
            &pair.challenge,
        );

        assert_eq!(
            service().verify_at(&code, &pair.verifier, 0),
            Err(MobileOAuthHandoffError::InvalidSignature)
        );
    }

    #[test]
    fn fails_on_a_malformed_code() {
        let pair = create_pkce_pair();
        let err = service().verify_at("not-a-valid-code", &pair.verifier, 0).unwrap_err();
        assert_eq!(err, MobileOAuthHandoffError::Malformed);
        assert_eq!(err.to_string(), "Malformed OAuth handoff code");
    }

    #[test]
    fn fails_once_the_code_has_expired() {
        let service = service();
        let pair = create_pkce_pair();
        let now = 1_700_000_000_000;
        let code = service.issue_at("access-1", "refresh-1", &pair.challenge, now);

        assert!(service.verify_at(&code, &pair.verifier, now + MOBILE_HANDOFF_TTL_MS).is_ok());
        let err = service.verify_at(&code, &pair.verifier, now + 2 * 60 * 1000).unwrap_err();
        assert_eq!(err, MobileOAuthHandoffError::Expired);
        assert_eq!(err.to_string(), "OAuth handoff code expired");
    }

    #[test]
    fn fails_when_the_verifier_does_not_hash_to_the_issued_challenge() {
        let service = service();
        let code = service.issue("access-1", "refresh-1", &create_pkce_pair().challenge);

        let err = service.verify_at(&code, &create_pkce_pair().verifier, 0).unwrap_err();
        assert_eq!(err, MobileOAuthHandoffError::InvalidPkceVerifier);
        assert_eq!(err.to_string(), "Invalid OAuth handoff PKCE verifier");
    }

    #[test]
    fn fails_on_a_malformed_verifier() {
        let service = service();
        let code = service.issue("access-1", "refresh-1", &create_pkce_pair().challenge);

        assert_eq!(
            service.verify_at(&code, "too-short", 0),
            Err(MobileOAuthHandoffError::InvalidPkceVerifier)
        );
    }

    #[test]
    fn the_port_reports_a_failure_as_an_internal_error() {
        // The use case replaces it with its own "Invalid or expired" message.
        let err = service().verify("not-a-valid-code", "too-short").unwrap_err();
        assert_eq!(err.code(), ErrorCode::InternalError);
    }

    /// Output of `MobileOAuthHandoffService.issue('access-token-1',
    /// 'refresh-token-1', deriveCodeChallenge(VERIFIER))` in
    /// `apps/api/src/infrastructure/auth/MobileOAuthHandoffService.ts`, run
    /// under `tsx` with `JWT_SECRET=cross-impl-test-jwt-secret-not-real` and
    /// `Date.now()` pinned to 1_700_000_000_000. `VERIFIER` is the RFC 7636
    /// appendix B example.
    const NODE_CODE: &str = "eyJhY2Nlc3NUb2tlbiI6ImFjY2Vzcy10b2tlbi0xIiwicmVmcmVzaFRva2VuIjoicmVmcmVzaC10b2tlbi0xIiwiZXhwIjoxNzAwMDAwMDYwMDAwLCJjb2RlQ2hhbGxlbmdlIjoiRTlNZWxob2EyT3d2RnJFTVRKZ3VDSGFvZUsxdDhVUldidUdKU3N0dy1jTSJ9.J6LvzBJ-J_LNCEs_byiGi8_IQLhcnsxEgcnS4FvML4g";
    const NODE_SECRET: &str = "cross-impl-test-jwt-secret-not-real";
    const NODE_NOW_MS: i64 = 1_700_000_000_000;
    const VERIFIER: &str = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

    #[test]
    fn redeems_a_code_minted_by_the_node_implementation() {
        let service = HmacMobileOAuthHandoffService::new(NODE_SECRET);

        let tokens = service.verify_at(NODE_CODE, VERIFIER, NODE_NOW_MS).unwrap();
        assert_eq!(tokens.access_token, "access-token-1");
        assert_eq!(tokens.refresh_token, "refresh-token-1");

        assert_eq!(
            service.verify_at(NODE_CODE, VERIFIER, NODE_NOW_MS + MOBILE_HANDOFF_TTL_MS + 1),
            Err(MobileOAuthHandoffError::Expired)
        );
        assert_eq!(
            service.verify_at(NODE_CODE, &"a".repeat(43), NODE_NOW_MS),
            Err(MobileOAuthHandoffError::InvalidPkceVerifier)
        );
    }

    #[test]
    fn mints_the_same_code_as_the_node_implementation() {
        let service = HmacMobileOAuthHandoffService::new(NODE_SECRET);
        let code = service.issue_at(
            "access-token-1",
            "refresh-token-1",
            &derive_code_challenge(VERIFIER),
            NODE_NOW_MS,
        );
        assert_eq!(code, NODE_CODE);
    }
}
