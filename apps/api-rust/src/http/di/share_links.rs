use crate::http::container::Container;
use crate::use_cases::share_links::{
    CreateShareLinkUseCase, DeleteShareLinkUseCase, GetSharedSummaryUseCase, ListShareLinksUseCase,
};

impl Container {
    pub fn create_share_link_use_case(&self) -> CreateShareLinkUseCase {
        CreateShareLinkUseCase {
            share_link_repository: self.share_link_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn list_share_links_use_case(&self) -> ListShareLinksUseCase {
        ListShareLinksUseCase { share_link_repository: self.share_link_repository.clone() }
    }

    pub fn delete_share_link_use_case(&self) -> DeleteShareLinkUseCase {
        DeleteShareLinkUseCase { share_link_repository: self.share_link_repository.clone() }
    }

    pub fn get_shared_summary_use_case(&self) -> GetSharedSummaryUseCase {
        GetSharedSummaryUseCase {
            share_link_repository: self.share_link_repository.clone(),
            application_repository: self.application_repository.clone(),
            interview_round_repository: self.interview_round_repository.clone(),
        }
    }
}
