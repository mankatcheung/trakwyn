use chrono::Utc;
use serde::Serialize;
use serde_json::Value;

use crate::infrastructure::auth::encoding::{
    base64url, constant_time_eq, decode_base64_lenient, hmac_sha256_base64url, random_nonce,
    split_signed,
};

/// How long a rendered consent screen stays submittable. `apps/api` keeps
/// this as `MCP_OAUTH.CONSENT_TOKEN_TTL_MS` beside the other MCP OAuth policy
/// values; it belongs in `use_cases::constants::mcp_oauth` once that module
/// is ported.
pub const MCP_CONSENT_TOKEN_TTL_MS: i64 = 10 * 60 * 1000;

/// The authorization request a consent decision is bound to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct McpConsentSubject<'a> {
    pub user_id: &'a str,
    pub client_id: &'a str,
    pub redirect_uri: &'a str,
    pub scope: &'a str,
    pub code_challenge: &'a str,
}

/// The JSON `apps/api` signs, keys in its order.
#[derive(Serialize)]
struct Payload<'a> {
    #[serde(rename = "userId")]
    user_id: &'a str,
    #[serde(rename = "clientId")]
    client_id: &'a str,
    #[serde(rename = "redirectUri")]
    redirect_uri: &'a str,
    scope: &'a str,
    #[serde(rename = "codeChallenge")]
    code_challenge: &'a str,
    nonce: &'a str,
    exp: i64,
}

/// Signs and verifies the short-lived token that proves a consent POST came
/// from a consent screen the user was actually shown.
///
/// Why this exists: `POST /oauth/authorize/approve` authenticates from the
/// session cookie, which is `SameSite=None` in production, so the browser
/// attaches it to cross-site requests. Without this token, `approved: true` is
/// just a field any page could submit on a logged-in user's behalf, and the
/// response carries the authorization code. The token is issued only by the
/// `GET` half, which the API answers with the client's name for the user to
/// read, so a valid one cannot exist unless the screen was rendered.
///
/// It is bound to the exact authorization request, not just the user: a token
/// obtained for one client cannot approve a grant for another.
///
/// Stateless HMAC over the payload, reusing `JWT_SECRET`, matching
/// [`super::OAuthStateService`]. Not single-use: the paired Origin check is
/// what stops cross-site submission, and this binds the decision to a real
/// screen.
pub struct McpOAuthConsentService {
    secret: String,
}

impl McpOAuthConsentService {
    /// `secret` is `JWT_SECRET`.
    pub fn new(secret: impl Into<String>) -> Self {
        Self { secret: secret.into() }
    }

    pub fn issue(&self, subject: McpConsentSubject<'_>) -> String {
        self.issue_at(subject, &random_nonce(), Utc::now().timestamp_millis())
    }

    fn issue_at(&self, subject: McpConsentSubject<'_>, nonce: &str, now_ms: i64) -> String {
        let payload = Payload {
            user_id: subject.user_id,
            client_id: subject.client_id,
            redirect_uri: subject.redirect_uri,
            scope: subject.scope,
            code_challenge: subject.code_challenge,
            nonce,
            exp: now_ms + MCP_CONSENT_TOKEN_TTL_MS,
        };
        // Serialising a struct of strings and an integer cannot fail.
        let encoded = base64url(serde_json::to_vec(&payload).unwrap_or_default());
        format!("{encoded}.{}", hmac_sha256_base64url(&self.secret, &encoded))
    }

    /// True only for an unexpired token this server issued for exactly this request.
    pub fn verify(&self, token: &str, subject: McpConsentSubject<'_>) -> bool {
        self.verify_at(token, subject, Utc::now().timestamp_millis())
    }

    fn verify_at(&self, token: &str, subject: McpConsentSubject<'_>, now_ms: i64) -> bool {
        let Some((encoded, signature)) = split_signed(token) else {
            return false;
        };
        let expected = hmac_sha256_base64url(&self.secret, encoded);
        if !constant_time_eq(signature.as_bytes(), expected.as_bytes()) {
            return false;
        }

        let Ok(payload) = serde_json::from_slice::<Value>(&decode_base64_lenient(encoded)) else {
            return false;
        };
        // A float comparison, as in JavaScript: `exp` only has to be a number.
        #[allow(clippy::cast_precision_loss)]
        let expired = match payload.get("exp").and_then(Value::as_f64) {
            Some(exp) => exp < now_ms as f64,
            None => return false,
        };
        if expired {
            return false;
        }

        let field = |name: &str| payload.get(name).and_then(Value::as_str);
        field("userId") == Some(subject.user_id)
            && field("clientId") == Some(subject.client_id)
            && field("redirectUri") == Some(subject.redirect_uri)
            && field("scope") == Some(subject.scope)
            && field("codeChallenge") == Some(subject.code_challenge)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SUBJECT: McpConsentSubject<'static> = McpConsentSubject {
        user_id: "user-1",
        client_id: "client-1",
        redirect_uri: "http://localhost:6274/callback",
        scope: "read",
        code_challenge: "challenge-1",
    };

    fn service() -> McpOAuthConsentService {
        McpOAuthConsentService::new("test-secret")
    }

    #[test]
    fn accepts_a_token_it_issued_for_the_same_authorization_request() {
        let service = service();
        assert!(service.verify(&service.issue(SUBJECT), SUBJECT));
    }

    #[test]
    fn rejects_a_token_issued_for_a_different_client() {
        // The whole point: a consent screen shown for one client cannot be
        // used to approve a grant for another.
        let service = service();
        let token = service.issue(SUBJECT);

        assert!(
            !service.verify(&token, McpConsentSubject { client_id: "attacker-client", ..SUBJECT })
        );
    }

    #[test]
    fn rejects_a_token_issued_for_a_different_user_redirect_uri_scope_or_challenge() {
        let service = service();
        let token = service.issue(SUBJECT);

        assert!(!service.verify(&token, McpConsentSubject { user_id: "user-2", ..SUBJECT }));
        assert!(!service.verify(
            &token,
            McpConsentSubject { redirect_uri: "https://evil.example/cb", ..SUBJECT }
        ));
        assert!(!service.verify(&token, McpConsentSubject { scope: "full", ..SUBJECT }));
        assert!(!service.verify(&token, McpConsentSubject { code_challenge: "other", ..SUBJECT }));
    }

    #[test]
    fn rejects_a_token_whose_payload_was_edited_to_widen_the_scope() {
        let service = service();
        let token = service.issue(SUBJECT);
        let (encoded, signature) = token.split_once('.').unwrap();
        let edited = String::from_utf8(decode_base64_lenient(encoded))
            .unwrap()
            .replace(r#""scope":"read""#, r#""scope":"full""#);
        let forged = format!("{}.{signature}", base64url(edited));

        assert!(!service.verify(&forged, McpConsentSubject { scope: "full", ..SUBJECT }));
    }

    #[test]
    fn rejects_a_token_signed_with_a_different_secret() {
        let token = service().issue(SUBJECT);
        assert!(!McpOAuthConsentService::new("someone-elses-secret").verify(&token, SUBJECT));
    }

    #[test]
    fn rejects_an_expired_token() {
        let service = service();
        let now = 1_700_000_000_000;
        let token = service.issue_at(SUBJECT, "nonce", now);

        assert!(service.verify_at(&token, SUBJECT, now + MCP_CONSENT_TOKEN_TTL_MS));
        assert!(!service.verify_at(&token, SUBJECT, now + 11 * 60 * 1000));
    }

    #[test]
    fn rejects_malformed_input_rather_than_failing() {
        let service = service();
        assert!(!service.verify("", SUBJECT));
        assert!(!service.verify("not-a-token", SUBJECT));
        assert!(!service.verify("!!!.!!!", SUBJECT));
    }

    #[test]
    fn rejects_a_signed_payload_that_is_not_a_consent_payload() {
        let service = service();
        let sign = |json: &str| {
            let encoded = base64url(json);
            format!("{encoded}.{}", hmac_sha256_base64url("test-secret", &encoded))
        };

        assert!(!service.verify(&sign("not json"), SUBJECT));
        // No expiry, or one that is not a number.
        assert!(!service.verify(
            &sign(r#"{"userId":"user-1","clientId":"client-1","redirectUri":"http://localhost:6274/callback","scope":"read","codeChallenge":"challenge-1"}"#),
            SUBJECT
        ));
        assert!(!service.verify(
            &sign(r#"{"userId":"user-1","clientId":"client-1","redirectUri":"http://localhost:6274/callback","scope":"read","codeChallenge":"challenge-1","exp":"99999999999999"}"#),
            SUBJECT
        ));
    }

    /// Output of `McpOAuthConsentService.issue` in
    /// `apps/api/src/infrastructure/auth/McpOAuthConsentService.ts`, run under
    /// `tsx` with `JWT_SECRET=cross-impl-test-jwt-secret-not-real` and
    /// `Date.now()` pinned to 1_700_000_000_000, for `NODE_SUBJECT`. The nonce
    /// inside it is `9f367973876a906b917ead113c2ee5b5`.
    const NODE_TOKEN: &str = "eyJ1c2VySWQiOiJ1c2VyLTEiLCJjbGllbnRJZCI6InRyYWt3eW5fbWNwX2NsaWVudF9hYmMiLCJyZWRpcmVjdFVyaSI6Imh0dHA6Ly9sb2NhbGhvc3Q6NjI3NC9jYWxsYmFjayIsInNjb3BlIjoicmVhZCIsImNvZGVDaGFsbGVuZ2UiOiJjaGFsbGVuZ2UtMSIsIm5vbmNlIjoiOWYzNjc5NzM4NzZhOTA2YjkxN2VhZDExM2MyZWU1YjUiLCJleHAiOjE3MDAwMDA2MDAwMDB9.-FMjsKGIU2AsTLAzpFy4moddikvGOsjh_IQG1RVDd_w";
    const NODE_SECRET: &str = "cross-impl-test-jwt-secret-not-real";
    const NODE_NOW_MS: i64 = 1_700_000_000_000;
    const NODE_SUBJECT: McpConsentSubject<'static> = McpConsentSubject {
        user_id: "user-1",
        client_id: "trakwyn_mcp_client_abc",
        redirect_uri: "http://localhost:6274/callback",
        scope: "read",
        code_challenge: "challenge-1",
    };

    #[test]
    fn accepts_a_token_minted_by_the_node_implementation() {
        let service = McpOAuthConsentService::new(NODE_SECRET);

        assert!(service.verify_at(NODE_TOKEN, NODE_SUBJECT, NODE_NOW_MS));
        assert!(!service.verify_at(
            NODE_TOKEN,
            NODE_SUBJECT,
            NODE_NOW_MS + MCP_CONSENT_TOKEN_TTL_MS + 1
        ));
        assert!(!service.verify_at(
            NODE_TOKEN,
            McpConsentSubject { client_id: "trakwyn_mcp_client_other", ..NODE_SUBJECT },
            NODE_NOW_MS
        ));
    }

    #[test]
    fn mints_the_same_token_as_the_node_implementation() {
        let service = McpOAuthConsentService::new(NODE_SECRET);
        assert_eq!(
            service.issue_at(NODE_SUBJECT, "9f367973876a906b917ead113c2ee5b5", NODE_NOW_MS),
            NODE_TOKEN
        );
    }
}
