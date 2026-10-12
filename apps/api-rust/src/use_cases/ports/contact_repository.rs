use async_trait::async_trait;

use crate::domain::contact::Contact;
use crate::use_cases::errors::DomainResult;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CreateContactData {
    pub id: String,
    pub application_id: String,
    pub name: String,
    pub role: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub linkedin_url: Option<String>,
    pub notes: Option<String>,
}

/// A field left `None` is not written. For a nullable column, `Some(None)`
/// writes null.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UpdateContactData {
    pub name: Option<String>,
    pub role: Option<Option<String>>,
    pub email: Option<Option<String>>,
    pub phone: Option<Option<String>>,
    pub linkedin_url: Option<Option<String>>,
    pub notes: Option<Option<String>>,
}

#[async_trait]
pub trait ContactRepository: Send + Sync {
    /// Oldest first.
    async fn find_all_by_application_id(&self, application_id: &str) -> DomainResult<Vec<Contact>>;
    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64>;
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Contact>>;
    async fn create(&self, data: CreateContactData) -> DomainResult<Contact>;
    async fn update(&self, id: &str, data: UpdateContactData) -> DomainResult<Contact>;
    /// `application_id` is the contact's owner, passed so a caching decorator
    /// can invalidate that application's list without a lookup.
    async fn delete(&self, id: &str, application_id: &str) -> DomainResult<()>;
}
