use crate::http::container::Container;
use crate::use_cases::auth::AuthenticateMcpRequestUseCase;
use crate::use_cases::mcp_oauth::{
    CreateMcpOAuthAccessTokenUseCase, CreateMcpOAuthAuthorizationCodeUseCase,
    CreateMcpOAuthRefreshTokenUseCase, ExchangeMcpOAuthAuthorizationCodeUseCase,
    ListMcpOAuthGrantsUseCase, RegisterMcpOAuthClientUseCase, RevokeMcpOAuthGrantForUserUseCase,
    RevokeMcpOAuthGrantUseCase, RotateMcpOAuthRefreshTokenUseCase,
    ValidateMcpOAuthAccessTokenUseCase,
};

impl Container {
    pub fn create_mcp_oauth_access_token_use_case(&self) -> CreateMcpOAuthAccessTokenUseCase {
        CreateMcpOAuthAccessTokenUseCase {
            mcp_oauth_token_repository: self.mcp_oauth_token_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn create_mcp_oauth_refresh_token_use_case(&self) -> CreateMcpOAuthRefreshTokenUseCase {
        CreateMcpOAuthRefreshTokenUseCase {
            mcp_oauth_refresh_token_repository: self.mcp_oauth_refresh_token_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn register_mcp_oauth_client_use_case(&self) -> RegisterMcpOAuthClientUseCase {
        RegisterMcpOAuthClientUseCase {
            mcp_oauth_client_repository: self.mcp_oauth_client_repository.clone(),
        }
    }

    pub fn create_mcp_oauth_authorization_code_use_case(
        &self,
    ) -> CreateMcpOAuthAuthorizationCodeUseCase {
        CreateMcpOAuthAuthorizationCodeUseCase {
            mcp_oauth_authorization_code_repository: self
                .mcp_oauth_authorization_code_repository
                .clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn exchange_mcp_oauth_authorization_code_use_case(
        &self,
    ) -> ExchangeMcpOAuthAuthorizationCodeUseCase {
        ExchangeMcpOAuthAuthorizationCodeUseCase {
            mcp_oauth_authorization_code_repository: self
                .mcp_oauth_authorization_code_repository
                .clone(),
            mcp_oauth_client_repository: self.mcp_oauth_client_repository.clone(),
            mcp_oauth_token_repository: self.mcp_oauth_token_repository.clone(),
            mcp_oauth_refresh_token_repository: self.mcp_oauth_refresh_token_repository.clone(),
            create_mcp_oauth_access_token_use_case: self.create_mcp_oauth_access_token_use_case(),
            create_mcp_oauth_refresh_token_use_case: self.create_mcp_oauth_refresh_token_use_case(),
            security_event_repository: self.security_event_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn rotate_mcp_oauth_refresh_token_use_case(&self) -> RotateMcpOAuthRefreshTokenUseCase {
        RotateMcpOAuthRefreshTokenUseCase {
            mcp_oauth_refresh_token_repository: self.mcp_oauth_refresh_token_repository.clone(),
            mcp_oauth_token_repository: self.mcp_oauth_token_repository.clone(),
            create_mcp_oauth_access_token_use_case: self.create_mcp_oauth_access_token_use_case(),
            create_mcp_oauth_refresh_token_use_case: self.create_mcp_oauth_refresh_token_use_case(),
            security_event_repository: self.security_event_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn revoke_mcp_oauth_grant_use_case(&self) -> RevokeMcpOAuthGrantUseCase {
        RevokeMcpOAuthGrantUseCase {
            mcp_oauth_token_repository: self.mcp_oauth_token_repository.clone(),
            mcp_oauth_refresh_token_repository: self.mcp_oauth_refresh_token_repository.clone(),
        }
    }

    pub fn list_mcp_oauth_grants_use_case(&self) -> ListMcpOAuthGrantsUseCase {
        ListMcpOAuthGrantsUseCase {
            mcp_oauth_grant_repository: self.mcp_oauth_grant_repository.clone(),
        }
    }

    pub fn revoke_mcp_oauth_grant_for_user_use_case(&self) -> RevokeMcpOAuthGrantForUserUseCase {
        RevokeMcpOAuthGrantForUserUseCase {
            mcp_oauth_grant_repository: self.mcp_oauth_grant_repository.clone(),
            mcp_oauth_token_repository: self.mcp_oauth_token_repository.clone(),
            mcp_oauth_refresh_token_repository: self.mcp_oauth_refresh_token_repository.clone(),
            security_event_repository: self.security_event_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn validate_mcp_oauth_access_token_use_case(&self) -> ValidateMcpOAuthAccessTokenUseCase {
        ValidateMcpOAuthAccessTokenUseCase {
            mcp_oauth_token_repository: self.mcp_oauth_token_repository.clone(),
        }
    }

    /// For the `/mcp` endpoint: API tokens of either scope, and OAuth access tokens.
    pub fn authenticate_mcp_request_use_case(&self) -> AuthenticateMcpRequestUseCase {
        AuthenticateMcpRequestUseCase {
            validate_api_token_use_case: self.validate_api_token_use_case(),
            validate_mcp_oauth_access_token_use_case: Some(
                self.validate_mcp_oauth_access_token_use_case(),
            ),
        }
    }
}
