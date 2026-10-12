use crate::http::container::Container;
use crate::use_cases::oauth::{
    ExchangeMobileOAuthCodeUseCase, LinkOAuthAccountUseCase, ListLinkedOAuthAccountsUseCase,
    LoginOrSignupWithOAuthUseCase, UnlinkOAuthAccountUseCase,
};

impl Container {
    pub fn login_or_signup_with_oauth_use_case(&self) -> LoginOrSignupWithOAuthUseCase {
        LoginOrSignupWithOAuthUseCase {
            user_repository: self.user_repository.clone(),
            oauth_account_repository: self.oauth_account_repository.clone(),
            oauth_provider_registry: self.services.oauth_provider_registry.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn link_oauth_account_use_case(&self) -> LinkOAuthAccountUseCase {
        LinkOAuthAccountUseCase {
            oauth_account_repository: self.oauth_account_repository.clone(),
            oauth_provider_registry: self.services.oauth_provider_registry.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn unlink_oauth_account_use_case(&self) -> UnlinkOAuthAccountUseCase {
        UnlinkOAuthAccountUseCase {
            user_repository: self.user_repository.clone(),
            oauth_account_repository: self.oauth_account_repository.clone(),
        }
    }

    pub fn list_linked_oauth_accounts_use_case(&self) -> ListLinkedOAuthAccountsUseCase {
        ListLinkedOAuthAccountsUseCase {
            oauth_account_repository: self.oauth_account_repository.clone(),
        }
    }

    pub fn exchange_mobile_oauth_code_use_case(&self) -> ExchangeMobileOAuthCodeUseCase {
        ExchangeMobileOAuthCodeUseCase {
            mobile_oauth_handoff_service: self.services.mobile_oauth_handoff.clone(),
        }
    }
}
