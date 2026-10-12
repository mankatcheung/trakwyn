use std::sync::Arc;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

use crate::domain::mcp_oauth::{McpOAuthAccessToken, McpOAuthCodeChallengeMethod};
use crate::domain::security_event::SecurityEventType;
use crate::use_cases::clock::now;
use crate::use_cases::constants::mcp_oauth;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::mcp_oauth::{
    CreateMcpOAuthAccessTokenInput, CreateMcpOAuthAccessTokenUseCase,
    CreateMcpOAuthRefreshTokenInput, CreateMcpOAuthRefreshTokenUseCase,
};
use crate::use_cases::ports::{
    CreateSecurityEventData, McpOAuthAuthorizationCodeRepository, McpOAuthClientRepository,
    McpOAuthRefreshTokenRepository, McpOAuthTokenRepository, SecurityEventRepository,
};
use crate::use_cases::secret_token;

pub struct ExchangeMcpOAuthAuthorizationCodeInput {
    pub code: String,
    pub client_id: String,
    pub redirect_uri: String,
    pub code_verifier: String,
}

#[derive(Debug)]
pub struct ExchangeMcpOAuthAuthorizationCodeOutput {
    pub access_token: String,
    pub refresh_token: String,
    pub token: McpOAuthAccessToken,
}

pub struct ExchangeMcpOAuthAuthorizationCodeUseCase {
    pub mcp_oauth_authorization_code_repository: Arc<dyn McpOAuthAuthorizationCodeRepository>,
    pub mcp_oauth_client_repository: Arc<dyn McpOAuthClientRepository>,
    pub mcp_oauth_token_repository: Arc<dyn McpOAuthTokenRepository>,
    pub mcp_oauth_refresh_token_repository: Arc<dyn McpOAuthRefreshTokenRepository>,
    pub create_mcp_oauth_access_token_use_case: CreateMcpOAuthAccessTokenUseCase,
    pub create_mcp_oauth_refresh_token_use_case: CreateMcpOAuthRefreshTokenUseCase,
    pub security_event_repository: Arc<dyn SecurityEventRepository>,
    pub generate_id: GenerateId,
}

impl ExchangeMcpOAuthAuthorizationCodeUseCase {
    /// `None` is every refusal (the endpoint answers `invalid_grant`).
    pub async fn execute(
        &self,
        input: ExchangeMcpOAuthAuthorizationCodeInput,
    ) -> DomainResult<Option<ExchangeMcpOAuthAuthorizationCodeOutput>> {
        if !input.code.starts_with(mcp_oauth::AUTHORIZATION_CODE_PREFIX) {
            return Ok(None);
        }
        if !is_well_formed_verifier(&input.code_verifier) {
            return Ok(None);
        }

        let client = self.mcp_oauth_client_repository.find_by_id(&input.client_id).await?;
        match client {
            Some(client)
                if client.revoked_at.is_none()
                    && client.redirect_uris.contains(&input.redirect_uri) => {}
            _ => return Ok(None),
        }

        let code = self
            .mcp_oauth_authorization_code_repository
            .find_by_code_hash(&secret_token::hash(&input.code))
            .await?;
        let Some(code) = code else {
            return Ok(None);
        };
        if code.client_id != input.client_id || code.redirect_uri != input.redirect_uri {
            return Ok(None);
        }

        // A second presentation of a code that already worked means the code
        // leaked: whoever holds it raced the legitimate client, or picked it
        // up afterwards. Refusing the exchange is not enough, since the tokens
        // the *first* exchange produced may be the attacker's. Kill the whole
        // grant (OAuth 2.1 s4.1.3).
        if code.consumed_at.is_some() {
            self.revoke_grant(&code.family_id, &code.user_id).await?;
            return Ok(None);
        }
        if code.expires_at <= now() {
            return Ok(None);
        }
        if code.code_challenge_method != McpOAuthCodeChallengeMethod::S256
            || !matches_pkce(&input.code_verifier, &code.code_challenge)
        {
            return Ok(None);
        }

        // Consumption is a conditional UPDATE, so two concurrent exchanges
        // cannot both win. The loser lands here rather than in the branch above.
        let consumed =
            self.mcp_oauth_authorization_code_repository.consume(&code.id, now()).await?;
        if !consumed {
            self.revoke_grant(&code.family_id, &code.user_id).await?;
            return Ok(None);
        }

        let token = self
            .create_mcp_oauth_access_token_use_case
            .execute(CreateMcpOAuthAccessTokenInput {
                user_id: code.user_id.clone(),
                client_id: code.client_id.clone(),
                family_id: code.family_id.clone(),
                scope: code.scope,
            })
            .await?;
        let refresh_token = self
            .create_mcp_oauth_refresh_token_use_case
            .execute(CreateMcpOAuthRefreshTokenInput {
                user_id: code.user_id,
                client_id: code.client_id,
                family_id: code.family_id,
                scope: code.scope,
            })
            .await?;
        Ok(Some(ExchangeMcpOAuthAuthorizationCodeOutput {
            access_token: token.raw_token,
            refresh_token: refresh_token.raw_token,
            token: token.token,
        }))
    }

    async fn revoke_grant(&self, family_id: &str, user_id: &str) -> DomainResult<()> {
        let now: DateTime<Utc> = now();
        self.mcp_oauth_token_repository.revoke_family(family_id, now).await?;
        self.mcp_oauth_refresh_token_repository.revoke_family(family_id, now).await?;
        self.security_event_repository
            .create(CreateSecurityEventData {
                id: (self.generate_id)(),
                user_id: user_id.to_string(),
                event_type: SecurityEventType::McpOauthCodeReuseDetected,
                ip_address: None,
                user_agent: None,
            })
            .await?;
        Ok(())
    }
}

/// RFC 7636 s4.1: 43-128 characters from the unreserved set. Rejecting a
/// malformed verifier up front keeps a client from silently weakening PKCE to
/// a handful of guessable bytes.
fn is_well_formed_verifier(verifier: &str) -> bool {
    (mcp_oauth::CODE_VERIFIER_MIN_LENGTH..=mcp_oauth::CODE_VERIFIER_MAX_LENGTH)
        .contains(&verifier.len())
        && verifier
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~'))
}

fn matches_pkce(verifier: &str, expected_challenge: &str) -> bool {
    let actual = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    actual.len() == expected_challenge.len()
        && bool::from(actual.as_bytes().ct_eq(expected_challenge.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_verifier_is_43_to_128_unreserved_characters() {
        assert!(is_well_formed_verifier(&"a".repeat(43)));
        assert!(is_well_formed_verifier(&"a".repeat(128)));
        assert!(is_well_formed_verifier(&format!("{}-._~", "a".repeat(43))));
        assert!(!is_well_formed_verifier(&"a".repeat(42)));
        assert!(!is_well_formed_verifier(&"a".repeat(129)));
        assert!(!is_well_formed_verifier(&format!("{}!", "a".repeat(43))));
        assert!(!is_well_formed_verifier(&format!("{}\n", "a".repeat(43))));
    }

    /// RFC 7636 appendix B.
    #[test]
    fn matches_the_rfc_7636_example() {
        assert!(matches_pkce(
            "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        ));
        assert!(!matches_pkce(
            "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXl",
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        ));
    }
}
