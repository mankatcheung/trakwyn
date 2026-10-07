pub(crate) mod at_rest;
pub(crate) mod encoding;
mod extension_oauth_ids;
mod fake_oauth_provider;
mod github_oauth_provider;
mod google_oauth_provider;
mod google_oidc_token_verifier;
mod jwt;
mod mcp_oauth_consent_service;
mod mobile_oauth_handoff_service;
mod oauth_http;
mod oauth_provider_registry;
mod oauth_state_service;
mod pkce;
mod qr_code;
mod totp_provider;

pub use extension_oauth_ids::{extension_redirect_url, parse_extension_oauth_ids};
pub use fake_oauth_provider::{FakeOAuthProvider, FAKE_OAUTH_CONSENT_PATH};
pub use github_oauth_provider::{GitHubOAuthEndpoints, GitHubOAuthProvider};
pub use google_oauth_provider::{GoogleOAuthEndpoints, GoogleOAuthProvider};
pub use google_oidc_token_verifier::{GoogleOidcTokenVerifier, GOOGLE_JWKS_URL};
pub use jwt::JwtTokenService;
pub use mcp_oauth_consent_service::{
    McpConsentSubject, McpOAuthConsentService, MCP_CONSENT_TOKEN_TTL_MS,
};
pub use mobile_oauth_handoff_service::{
    HmacMobileOAuthHandoffService, MobileOAuthHandoffError, MOBILE_HANDOFF_TTL_MS,
};
pub use oauth_http::{oauth_http_client, OAuthExchangeError};
pub use oauth_provider_registry::StaticOAuthProviderRegistry;
pub use oauth_state_service::{
    IssuedOAuthState, OAuthState, OAuthStateError, OAuthStateMode, OAuthStateService,
    OAUTH_STATE_TTL_MS,
};
pub use pkce::{create_pkce_pair, derive_code_challenge, is_well_formed_pkce_value, PkcePair};
pub use qr_code::qr_code_data_url;
pub use totp_provider::{Rfc6238TotpProvider, TotpError};
