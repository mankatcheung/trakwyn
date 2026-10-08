use std::sync::Arc;

use url::Url;

use crate::domain::mcp_oauth::McpOAuthClient;
use crate::use_cases::constants::mcp_oauth;
use crate::use_cases::documents::js_whitespace::js_trim;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{CreateMcpOAuthClientData, McpOAuthClientRepository};
use crate::use_cases::secret_token;

pub struct RegisterMcpOAuthClientInput {
    pub name: String,
    pub redirect_uris: Vec<String>,
}

pub struct RegisterMcpOAuthClientUseCase {
    pub mcp_oauth_client_repository: Arc<dyn McpOAuthClientRepository>,
}

impl RegisterMcpOAuthClientUseCase {
    pub async fn execute(
        &self,
        input: RegisterMcpOAuthClientInput,
    ) -> DomainResult<McpOAuthClient> {
        let name = js_trim(&input.name).to_string();
        let mut redirect_uris: Vec<String> = Vec::new();
        for uri in &input.redirect_uris {
            let uri = js_trim(uri).to_string();
            if !redirect_uris.contains(&uri) {
                redirect_uris.push(uri);
            }
        }
        // JavaScript's `length` counts UTF-16 code units.
        if name.is_empty() || name.encode_utf16().count() > mcp_oauth::CLIENT_NAME_MAX_LENGTH {
            return Err(DomainError::validation(
                "client_name must be between 1 and 100 characters",
            ));
        }
        if redirect_uris.is_empty() || redirect_uris.iter().any(|uri| !is_allowed_redirect_uri(uri))
        {
            return Err(DomainError::validation(
                "redirect_uris must contain valid exact HTTP(S) URLs",
            ));
        }

        let id =
            secret_token::generate(mcp_oauth::CLIENT_ID_PREFIX, mcp_oauth::CLIENT_ID_RANDOM_BYTES)?;
        self.mcp_oauth_client_repository
            .create(CreateMcpOAuthClientData { id, name, redirect_uris })
            .await
    }
}

/// `https`, or `http` on a loopback host.
fn is_allowed_redirect_uri(value: &str) -> bool {
    let Ok(uri) = Url::parse(value) else {
        return false;
    };
    match uri.scheme() {
        "https" => true,
        "http" => matches!(uri.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")),
        _ => false,
    }
}
