use chrono::Utc;
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::use_cases::constants::token_lifetime_s;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{AccessClaims, RefreshClaims, TokenPair, TokenService};

/// The claim set `apps/api` signs with `jsonwebtoken` (HS256), field for
/// field, so a token minted by either implementation verifies in the other.
#[derive(Serialize, Deserialize)]
struct Claims {
    sub: String,
    email: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    sid: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    jti: Option<String>,
    #[serde(rename = "authTime", default, skip_serializing_if = "Option::is_none")]
    auth_time: Option<i64>,
    iat: i64,
    exp: i64,
}

pub struct JwtTokenService {
    access_encoding: EncodingKey,
    access_decoding: DecodingKey,
    refresh_encoding: EncodingKey,
    refresh_decoding: DecodingKey,
    validation: Validation,
}

impl JwtTokenService {
    pub fn new(access_secret: &str, refresh_secret: &str) -> Self {
        let mut validation = Validation::new(Algorithm::HS256);
        // Node's `jsonwebtoken` allows no clock skew by default; the crate's
        // default of 60 s would keep an expired token alive for another minute.
        validation.leeway = 0;
        Self {
            access_encoding: EncodingKey::from_secret(access_secret.as_bytes()),
            access_decoding: DecodingKey::from_secret(access_secret.as_bytes()),
            refresh_encoding: EncodingKey::from_secret(refresh_secret.as_bytes()),
            refresh_decoding: DecodingKey::from_secret(refresh_secret.as_bytes()),
            validation,
        }
    }

    fn encode(&self, claims: &Claims, key: &EncodingKey) -> DomainResult<String> {
        encode(&Header::new(Algorithm::HS256), claims, key).map_err(DomainError::internal)
    }
}

impl TokenService for JwtTokenService {
    fn sign(
        &self,
        user_id: &str,
        email: &str,
        session_id: &str,
        refresh_token_id: &str,
        auth_time_ms: i64,
    ) -> DomainResult<TokenPair> {
        let issued_at = Utc::now().timestamp();
        let claims = |jti: Option<&str>, lifetime_s: i64| Claims {
            sub: user_id.to_string(),
            email: email.to_string(),
            sid: Some(session_id.to_string()),
            jti: jti.map(str::to_string),
            auth_time: Some(auth_time_ms),
            iat: issued_at,
            exp: issued_at + lifetime_s,
        };

        Ok(TokenPair {
            access_token: self
                .encode(&claims(None, token_lifetime_s::ACCESS_TOKEN), &self.access_encoding)?,
            refresh_token: self.encode(
                &claims(Some(refresh_token_id), token_lifetime_s::REFRESH_TOKEN),
                &self.refresh_encoding,
            )?,
        })
    }

    fn verify_access(&self, token: &str) -> Option<AccessClaims> {
        let claims = decode::<Claims>(token, &self.access_decoding, &self.validation).ok()?.claims;
        Some(AccessClaims {
            sub: claims.sub,
            email: claims.email,
            sid: claims.sid,
            auth_time: claims.auth_time,
        })
    }

    fn verify_refresh(&self, token: &str) -> DomainResult<RefreshClaims> {
        let invalid = || DomainError::unauthorized("Invalid refresh token");
        let claims = decode::<Claims>(token, &self.refresh_decoding, &self.validation)
            .map_err(|_| invalid())?
            .claims;
        Ok(RefreshClaims {
            sub: claims.sub,
            email: claims.email,
            sid: claims.sid.ok_or_else(invalid)?,
            jti: claims.jti,
            auth_time: claims.auth_time,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::errors::ErrorCode;

    fn service() -> JwtTokenService {
        JwtTokenService::new("access-secret", "refresh-secret")
    }

    fn pair() -> TokenPair {
        service().sign("user-1", "a@example.com", "sid-1", "jti-1", 1_700_000_000_000).unwrap()
    }

    #[test]
    fn an_access_token_round_trips() {
        let claims = service().verify_access(&pair().access_token).unwrap();

        assert_eq!(claims.sub, "user-1");
        assert_eq!(claims.email, "a@example.com");
        assert_eq!(claims.sid.as_deref(), Some("sid-1"));
        assert_eq!(claims.auth_time, Some(1_700_000_000_000));
    }

    #[test]
    fn a_refresh_token_round_trips_with_its_id() {
        let claims = service().verify_refresh(&pair().refresh_token).unwrap();

        assert_eq!(claims.sid, "sid-1");
        assert_eq!(claims.jti.as_deref(), Some("jti-1"));
    }

    #[test]
    fn the_two_token_kinds_are_not_interchangeable() {
        let pair = pair();

        assert_eq!(service().verify_access(&pair.refresh_token), None);
        let err = service().verify_refresh(&pair.access_token).unwrap_err();
        assert_eq!(err.code(), ErrorCode::Unauthorized);
    }

    #[test]
    fn rejects_a_token_signed_with_another_secret() {
        let other = JwtTokenService::new("someone-elses", "secrets");
        assert_eq!(other.verify_access(&pair().access_token), None);
    }

    #[test]
    fn rejects_an_expired_token() {
        let service = service();
        let expired = Claims {
            sub: "user-1".to_string(),
            email: "a@example.com".to_string(),
            sid: Some("sid-1".to_string()),
            jti: None,
            auth_time: None,
            iat: Utc::now().timestamp() - 120,
            exp: Utc::now().timestamp() - 1,
        };
        let token = service.encode(&expired, &service.access_encoding).unwrap();

        assert_eq!(service.verify_access(&token), None);
    }

    /// Output of Node `jsonwebtoken`'s `jwt.sign` (the library `apps/api`
    /// uses) for these claims with the secret `access-secret` and an `exp`
    /// in 2286. It must verify here, or the two implementations could not
    /// share sessions.
    #[test]
    fn verifies_a_token_minted_by_the_node_implementation() {
        const NODE_TOKEN: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJlbWFpbCI6ImFAZXhhbXBsZS5jb20iLCJzaWQiOiJzaWQtMSIsImF1dGhUaW1lIjoxNzAwMDAwMDAwMDAwLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6OTk5OTk5OTk5OX0.dEiZDeGUdpx0LbwtJrdrZ5nFDF4qZKhZqXakQ_PJKDg";

        let claims = service().verify_access(NODE_TOKEN).unwrap();
        assert_eq!(claims.sub, "user-1");
        assert_eq!(claims.auth_time, Some(1_700_000_000_000));
    }
}
