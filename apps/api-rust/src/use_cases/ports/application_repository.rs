use async_trait::async_trait;

use crate::domain::application::Application;
use crate::use_cases::errors::DomainResult;

#[async_trait]
pub trait ApplicationRepository: Send + Sync {
    /// Hides trashed applications: every ownership check goes through here,
    /// so nothing can be attached to an application that is in Trash.
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Application>>;
}
