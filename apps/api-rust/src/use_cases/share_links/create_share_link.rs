use std::sync::Arc;

use crate::domain::share_link::ShareLink;
use crate::use_cases::constants::share_link;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{CreateShareLinkData, ShareLinkRepository};
use crate::use_cases::secret_token;

pub struct CreateShareLinkInput {
    pub user_id: String,
    pub name: String,
}

#[derive(Debug)]
pub struct CreateShareLinkOutput {
    pub share_link: ShareLink,
    /// The secret itself. Returned here once and never again: only its hash
    /// is stored.
    pub raw_token: String,
}

pub struct CreateShareLinkUseCase {
    pub share_link_repository: Arc<dyn ShareLinkRepository>,
    pub generate_id: GenerateId,
}

impl CreateShareLinkUseCase {
    pub async fn execute(
        &self,
        input: CreateShareLinkInput,
    ) -> DomainResult<CreateShareLinkOutput> {
        let raw_token = secret_token::generate(share_link::PREFIX, share_link::RANDOM_BYTES)?;
        let token_hash = secret_token::hash(&raw_token);

        let share_link = self
            .share_link_repository
            .create(CreateShareLinkData {
                id: (self.generate_id)(),
                user_id: input.user_id,
                name: input.name,
                token_hash,
            })
            .await?;

        Ok(CreateShareLinkOutput { share_link, raw_token })
    }
}
