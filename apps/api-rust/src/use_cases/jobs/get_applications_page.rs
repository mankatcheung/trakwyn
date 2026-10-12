use std::sync::Arc;

use crate::domain::application::{Application, ApplicationStatus};
use crate::use_cases::constants::pagination;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{
    ApplicationRepository, FindApplicationsPageFilters, FindApplicationsPagePagination,
};

#[derive(Debug, Clone, Default)]
pub struct GetApplicationsPageInput {
    pub user_id: String,
    pub status: Option<ApplicationStatus>,
    pub starred: Option<bool>,
    pub search: Option<String>,
    pub likely_ghosted: Option<bool>,
    pub cursor: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GetApplicationsPageOutput {
    pub items: Vec<Application>,
    pub next_cursor: Option<String>,
    pub has_next_page: bool,
}

pub struct GetApplicationsPageUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl GetApplicationsPageUseCase {
    pub async fn execute(
        &self,
        input: GetApplicationsPageInput,
    ) -> DomainResult<GetApplicationsPageOutput> {
        let limit =
            input.limit.unwrap_or(pagination::DEFAULT_LIMIT).clamp(1, pagination::MAX_LIMIT);

        let page = self
            .application_repository
            .find_page_by_user_id(
                &input.user_id,
                FindApplicationsPageFilters {
                    status: input.status,
                    starred: input.starred,
                    search: input.search,
                    likely_ghosted: input.likely_ghosted,
                },
                FindApplicationsPagePagination { cursor: input.cursor, limit },
            )
            .await?;

        let next_cursor = if page.has_next_page {
            page.items.last().map(|application| application.id.clone())
        } else {
            None
        };
        Ok(GetApplicationsPageOutput {
            items: page.items,
            next_cursor,
            has_next_page: page.has_next_page,
        })
    }
}
