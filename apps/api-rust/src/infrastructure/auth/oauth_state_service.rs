use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::domain::oauth_account::OAuthProviderName;
use crate::infrastructure::auth::encoding::{
    base64url, constant_time_eq, decode_base64_lenient, hmac_sha256_base64url, random_nonce,
    split_signed,
};

/// How long the signed `state` redirect param stays valid, in milliseconds.
pub const OAUTH_STATE_TTL_MS: i64 = 5 * 60 * 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OAuthStateMode {
    Login,
    Link,
}

impl OAuthStateMode {
    pub const ALL: [Self; 2] = [Self::Login, Self::Link];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Login => "login",
            Self::Link => "link",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|mode| mode.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OAuthState {
    pub provider: OAuthProviderName,
    pub mode: OAuthStateMode,
    pub user_id: Option<String>,
    pub return_to: Option<String>,
    pub nonce: String,
    /// Epoch milliseconds.
    pub exp: i64,
}

/// A freshly signed state and the nonce inside it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IssuedOAuthState {
    pub state: String,
    pub nonce: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum OAuthStateError {
    #[error("Malformed OAuth state")]
    Malformed,
    #[error("Invalid OAuth state signature")]
    InvalidSignature,
    #[error("OAuth state expired")]
    Expired,
}

/// The JSON `apps/api` signs: the same keys in the same order, with an unset
/// `userId`/`returnTo` left out as `JSON.stringify` leaves out `undefined`.
#[derive(Serialize, Deserialize)]
struct Payload {
    provider: String,
    mode: String,
    #[serde(rename = "userId", default, skip_serializing_if = "Option::is_none")]
    user_id: Option<String>,
    #[serde(rename = "returnTo", default, skip_serializing_if = "Option::is_none")]
    return_to: Option<String>,
    nonce: String,
    exp: i64,
}

/// Signs/verifies the short-lived `state` param carried through the OAuth
/// redirect dance. Stateless (HMAC over the payload) so it needs no
/// server-side storage and works across restarts/instances. It reuses
/// `JWT_SECRET` rather than introducing a new secret, and the format is
/// `apps/api`'s, so a flow started on one implementation finishes on the other.
pub struct OAuthStateService {
    secret: String,
}

impl OAuthStateService {
    /// `secret` is `JWT_SECRET`.
    pub fn new(secret: impl Into<String>) -> Self {
        Self { secret: secret.into() }
    }

    /// Returns the signed state and the nonce inside it. The caller needs the
    /// nonce separately so it can be stored in a cookie: the signature proves
    /// we minted this state, and the cookie is what proves we minted it for
    /// *this* browser (JEF-198).
    pub fn issue(
        &self,
        provider: OAuthProviderName,
        mode: OAuthStateMode,
        user_id: Option<&str>,
        return_to: Option<&str>,
    ) -> IssuedOAuthState {
        self.issue_at(
            provider,
            mode,
            user_id,
            return_to,
            random_nonce(),
            Utc::now().timestamp_millis(),
        )
    }

    fn issue_at(
        &self,
        provider: OAuthProviderName,
        mode: OAuthStateMode,
        user_id: Option<&str>,
        return_to: Option<&str>,
        nonce: String,
        now_ms: i64,
    ) -> IssuedOAuthState {
        let payload = Payload {
            provider: provider.as_str().to_string(),
            mode: mode.as_str().to_string(),
            user_id: user_id.map(str::to_string),
            return_to: return_to.map(str::to_string),
            nonce: nonce.clone(),
            exp: now_ms + OAUTH_STATE_TTL_MS,
        };
        // Serialising a struct of strings and an integer cannot fail.
        let encoded = base64url(serde_json::to_vec(&payload).unwrap_or_default());
        let signature = hmac_sha256_base64url(&self.secret, &encoded);
        IssuedOAuthState { state: format!("{encoded}.{signature}"), nonce }
    }

    pub fn verify(&self, state: &str) -> Result<OAuthState, OAuthStateError> {
        self.verify_at(state, Utc::now().timestamp_millis())
    }

    fn verify_at(&self, state: &str, now_ms: i64) -> Result<OAuthState, OAuthStateError> {
        let (encoded, signature) = split_signed(state).ok_or(OAuthStateError::Malformed)?;
        let expected = hmac_sha256_base64url(&self.secret, encoded);
        if !constant_time_eq(signature.as_bytes(), expected.as_bytes()) {
            return Err(OAuthStateError::InvalidSignature);
        }

        let payload: Payload = serde_json::from_slice(&decode_base64_lenient(encoded))
            .map_err(|_| OAuthStateError::Malformed)?;
        if payload.exp < now_ms {
            return Err(OAuthStateError::Expired);
        }
        Ok(OAuthState {
            provider: OAuthProviderName::parse(&payload.provider)
                .ok_or(OAuthStateError::Malformed)?,
            mode: OAuthStateMode::parse(&payload.mode).ok_or(OAuthStateError::Malformed)?,
            user_id: payload.user_id,
            return_to: payload.return_to,
            nonce: payload.nonce,
            exp: payload.exp,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn service() -> OAuthStateService {
        OAuthStateService::new("test-secret")
    }

    #[test]
    fn round_trips_provider_mode_and_user_id() {
        let service = service();
        let issued =
            service.issue(OAuthProviderName::Google, OAuthStateMode::Link, Some("user-1"), None);

        let parsed = service.verify(&issued.state).unwrap();

        assert_eq!(parsed.provider, OAuthProviderName::Google);
        assert_eq!(parsed.mode, OAuthStateMode::Link);
        assert_eq!(parsed.user_id.as_deref(), Some("user-1"));
    }

    #[test]
    fn omits_user_id_for_the_login_mode() {
        let service = service();
        let issued = service.issue(OAuthProviderName::Github, OAuthStateMode::Login, None, None);

        let parsed = service.verify(&issued.state).unwrap();

        assert_eq!(parsed.user_id, None);
        assert_eq!(parsed.return_to, None);
    }

    #[test]
    fn carries_the_return_path() {
        let service = service();
        let issued =
            service.issue(OAuthProviderName::Google, OAuthStateMode::Login, None, Some("/jobs"));

        assert_eq!(service.verify(&issued.state).unwrap().return_to.as_deref(), Some("/jobs"));
    }

    #[test]
    fn issues_a_different_nonce_each_time() {
        let service = service();
        let first = service.issue(OAuthProviderName::Google, OAuthStateMode::Login, None, None);
        let second = service.issue(OAuthProviderName::Google, OAuthStateMode::Login, None, None);

        assert_ne!(first.state, second.state);
        assert_ne!(first.nonce, second.nonce);
    }

    #[test]
    fn returns_the_nonce_that_is_inside_the_state() {
        let service = service();
        let issued = service.issue(OAuthProviderName::Google, OAuthStateMode::Login, None, None);

        assert!(!issued.nonce.is_empty());
        assert_eq!(service.verify(&issued.state).unwrap().nonce, issued.nonce);
    }

    #[test]
    fn fails_on_a_tampered_signature() {
        let service = service();
        let issued = service.issue(OAuthProviderName::Google, OAuthStateMode::Login, None, None);
        let payload = issued.state.split('.').next().unwrap();

        let err = service.verify(&format!("{payload}.tampered-signature")).unwrap_err();
        assert_eq!(err, OAuthStateError::InvalidSignature);
        assert_eq!(err.to_string(), "Invalid OAuth state signature");
    }

    #[test]
    fn fails_on_an_edited_payload() {
        let service = service();
        let issued =
            service.issue(OAuthProviderName::Google, OAuthStateMode::Link, Some("user-1"), None);
        let (payload, signature) = issued.state.split_once('.').unwrap();
        let edited =
            String::from_utf8(decode_base64_lenient(payload)).unwrap().replace("user-1", "user-2");

        let forged = format!("{}.{signature}", base64url(edited));
        assert_eq!(service.verify(&forged), Err(OAuthStateError::InvalidSignature));
    }

    #[test]
    fn fails_on_a_state_signed_with_another_secret() {
        let issued = OAuthStateService::new("someone-elses-secret").issue(
            OAuthProviderName::Google,
            OAuthStateMode::Login,
            None,
            None,
        );
        assert_eq!(service().verify(&issued.state), Err(OAuthStateError::InvalidSignature));
    }

    #[test]
    fn fails_on_a_malformed_state() {
        let err = service().verify("not-a-valid-state").unwrap_err();
        assert_eq!(err, OAuthStateError::Malformed);
        assert_eq!(err.to_string(), "Malformed OAuth state");
        assert_eq!(service().verify(""), Err(OAuthStateError::Malformed));
        assert_eq!(service().verify("payload."), Err(OAuthStateError::Malformed));
    }

    #[test]
    fn fails_once_the_state_has_expired() {
        let service = service();
        let now = 1_700_000_000_000;
        let issued = service.issue_at(
            OAuthProviderName::Google,
            OAuthStateMode::Login,
            None,
            None,
            random_nonce(),
            now,
        );

        // Valid up to and including the expiry instant, as in apps/api (`exp < now`).
        assert!(service.verify_at(&issued.state, now + OAUTH_STATE_TTL_MS).is_ok());
        let err = service.verify_at(&issued.state, now + 6 * 60 * 1000).unwrap_err();
        assert_eq!(err, OAuthStateError::Expired);
        assert_eq!(err.to_string(), "OAuth state expired");
    }

    // The three vectors below are the output of `OAuthStateService.issue` in
    // `apps/api/src/infrastructure/auth/OAuthStateService.ts`, run under
    // `tsx` with `JWT_SECRET=cross-impl-test-jwt-secret-not-real` and
    // `Date.now()` pinned to 1_700_000_000_000. Each is checked both ways:
    // this implementation accepts it, and, given the same nonce and clock,
    // mints the identical string.
    const NODE_SECRET: &str = "cross-impl-test-jwt-secret-not-real";
    const NODE_NOW_MS: i64 = 1_700_000_000_000;

    const NODE_STATE_LINK: &str = "eyJwcm92aWRlciI6Imdvb2dsZSIsIm1vZGUiOiJsaW5rIiwidXNlcklkIjoidXNlci0xIiwibm9uY2UiOiIwNDFjNmRjZGM2ZjgwZTMyYzVjOGVlMDQ4YTBiNjg1ZSIsImV4cCI6MTcwMDAwMDMwMDAwMH0._ECMW-OIwnelABA8t_y8RdkKK5tAz_JJedylxMkskOo";
    const NODE_STATE_LINK_NONCE: &str = "041c6dcdc6f80e32c5c8ee048a0b685e";

    const NODE_STATE_RETURN_TO: &str = "eyJwcm92aWRlciI6ImdpdGh1YiIsIm1vZGUiOiJsb2dpbiIsInJldHVyblRvIjoiL2FwcGxpY2F0aW9ucz90YWI9MSIsIm5vbmNlIjoiZmU3MTUyNjMzMmQ5ZDcwZWMyMjk2MjQxMTE3ZjQzZmQiLCJleHAiOjE3MDAwMDAzMDAwMDB9.cNwJDKR-lCD3vw-w-xatNHqXiDP8JO6LQ8FODA_1jQc";
    const NODE_STATE_RETURN_TO_NONCE: &str = "fe71526332d9d70ec2296241117f43fd";

    const NODE_STATE_LOGIN: &str = "eyJwcm92aWRlciI6Imdvb2dsZSIsIm1vZGUiOiJsb2dpbiIsIm5vbmNlIjoiNTNjYTk2NDZkODNkMjlhYjlmZDE4YzVhYjk1ZGQ3MTMiLCJleHAiOjE3MDAwMDAzMDAwMDB9.wJ6OD5ql5BtoIHK3BR2ErAXJen6jWUKTmL1dZ1wN78c";
    const NODE_STATE_LOGIN_NONCE: &str = "53ca9646d83d29ab9fd18c5ab95dd713";

    #[test]
    fn verifies_states_minted_by_the_node_implementation() {
        let service = OAuthStateService::new(NODE_SECRET);

        assert_eq!(
            service.verify_at(NODE_STATE_LINK, NODE_NOW_MS).unwrap(),
            OAuthState {
                provider: OAuthProviderName::Google,
                mode: OAuthStateMode::Link,
                user_id: Some("user-1".to_string()),
                return_to: None,
                nonce: NODE_STATE_LINK_NONCE.to_string(),
                exp: NODE_NOW_MS + OAUTH_STATE_TTL_MS,
            }
        );
        assert_eq!(
            service.verify_at(NODE_STATE_RETURN_TO, NODE_NOW_MS).unwrap(),
            OAuthState {
                provider: OAuthProviderName::Github,
                mode: OAuthStateMode::Login,
                user_id: None,
                return_to: Some("/applications?tab=1".to_string()),
                nonce: NODE_STATE_RETURN_TO_NONCE.to_string(),
                exp: NODE_NOW_MS + OAUTH_STATE_TTL_MS,
            }
        );
        assert_eq!(
            service.verify_at(NODE_STATE_LOGIN, NODE_NOW_MS).unwrap().nonce,
            NODE_STATE_LOGIN_NONCE
        );
        assert_eq!(
            service.verify_at(NODE_STATE_LOGIN, NODE_NOW_MS + OAUTH_STATE_TTL_MS + 1),
            Err(OAuthStateError::Expired)
        );
    }

    #[test]
    fn mints_the_same_state_as_the_node_implementation() {
        let service = OAuthStateService::new(NODE_SECRET);
        let issue = |provider, mode, user_id, return_to, nonce: &str| {
            service.issue_at(provider, mode, user_id, return_to, nonce.to_string(), NODE_NOW_MS)
        };

        assert_eq!(
            issue(
                OAuthProviderName::Google,
                OAuthStateMode::Link,
                Some("user-1"),
                None,
                NODE_STATE_LINK_NONCE
            )
            .state,
            NODE_STATE_LINK
        );
        assert_eq!(
            issue(
                OAuthProviderName::Github,
                OAuthStateMode::Login,
                None,
                Some("/applications?tab=1"),
                NODE_STATE_RETURN_TO_NONCE
            )
            .state,
            NODE_STATE_RETURN_TO
        );
        assert_eq!(
            issue(
                OAuthProviderName::Google,
                OAuthStateMode::Login,
                None,
                None,
                NODE_STATE_LOGIN_NONCE
            )
            .state,
            NODE_STATE_LOGIN
        );
    }
}
