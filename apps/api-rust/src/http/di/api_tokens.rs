use crate::http::container::Container;
use crate::use_cases::api_tokens::{
    CreateApiTokenUseCase, DeleteApiTokenUseCase, ListApiTokensUseCase, ValidateApiTokenUseCase,
};

impl Container {
    pub fn create_api_token_use_case(&self) -> CreateApiTokenUseCase {
        CreateApiTokenUseCase {
            api_token_repository: self.api_token_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn list_api_tokens_use_case(&self) -> ListApiTokensUseCase {
        ListApiTokensUseCase { api_token_repository: self.api_token_repository.clone() }
    }

    pub fn delete_api_token_use_case(&self) -> DeleteApiTokenUseCase {
        DeleteApiTokenUseCase { api_token_repository: self.api_token_repository.clone() }
    }

    pub fn validate_api_token_use_case(&self) -> ValidateApiTokenUseCase {
        ValidateApiTokenUseCase { api_token_repository: self.api_token_repository.clone() }
    }
}
