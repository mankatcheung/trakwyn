use std::cmp::Reverse;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::document_draft::{DocumentDraft, DocumentDraftType};
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{
    CreateDocumentDraftData, DocumentDraftRepository, UpdateDocumentDraftContentData,
};

/// It knows which user owns an application, and whether that application is
/// in Trash, only when told through `owned_by` and `trashed`.
#[derive(Default)]
pub struct FakeDocumentDraftRepository {
    drafts: Mutex<Vec<DocumentDraft>>,
    owners: Mutex<HashMap<String, String>>,
    trashed: Mutex<HashSet<String>>,
}

impl FakeDocumentDraftRepository {
    pub fn with(drafts: Vec<DocumentDraft>) -> Self {
        Self { drafts: Mutex::new(drafts), ..Self::default() }
    }

    /// Records that `application_id` belongs to `user_id`, for the
    /// cross-application lookup.
    pub fn owned_by(self, application_id: &str, user_id: &str) -> Self {
        self.owners.lock().unwrap().insert(application_id.to_string(), user_id.to_string());
        self
    }

    /// Records that `application_id` is in Trash.
    pub fn trashed(self, application_id: &str) -> Self {
        self.trashed.lock().unwrap().insert(application_id.to_string());
        self
    }

    pub fn all(&self) -> Vec<DocumentDraft> {
        self.drafts.lock().unwrap().clone()
    }

    fn update_with(
        &self,
        id: &str,
        change: impl FnOnce(&mut DocumentDraft),
    ) -> DomainResult<DocumentDraft> {
        let mut drafts = self.drafts.lock().unwrap();
        let draft = drafts
            .iter_mut()
            .find(|draft| draft.id == id)
            .ok_or_else(|| DomainError::not_found("Document draft not found"))?;
        change(draft);
        draft.updated_at = now();
        Ok(draft.clone())
    }
}

#[async_trait]
impl DocumentDraftRepository for FakeDocumentDraftRepository {
    async fn find_all_by_application_id(
        &self,
        application_id: &str,
    ) -> DomainResult<Vec<DocumentDraft>> {
        let mut drafts: Vec<DocumentDraft> =
            self.all().into_iter().filter(|draft| draft.application_id == application_id).collect();
        drafts.sort_by_key(|draft| Reverse(draft.updated_at));
        Ok(drafts)
    }

    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64> {
        Ok(self.find_all_by_application_id(application_id).await?.len() as i64)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<DocumentDraft>> {
        Ok(self.all().into_iter().find(|draft| draft.id == id))
    }

    async fn create(&self, data: CreateDocumentDraftData) -> DomainResult<DocumentDraft> {
        let timestamp = now();
        let draft = DocumentDraft {
            id: data.id,
            application_id: data.application_id,
            draft_type: data.draft_type,
            title: data.title,
            content_json: data.content_json.unwrap_or_else(|| "{}".to_string()),
            plain_text: data.plain_text.unwrap_or_default(),
            source_document_id: data.source_document_id,
            created_at: timestamp,
            updated_at: timestamp,
        };
        self.drafts.lock().unwrap().push(draft.clone());
        Ok(draft)
    }

    async fn update_content(
        &self,
        id: &str,
        data: UpdateDocumentDraftContentData,
    ) -> DomainResult<DocumentDraft> {
        self.update_with(id, |draft| {
            draft.content_json = data.content_json;
            draft.plain_text = data.plain_text;
        })
    }

    async fn rename(&self, id: &str, title: &str) -> DomainResult<DocumentDraft> {
        self.update_with(id, |draft| draft.title = title.to_string())
    }

    async fn delete(&self, id: &str) -> DomainResult<()> {
        self.drafts.lock().unwrap().retain(|draft| draft.id != id);
        Ok(())
    }

    async fn find_recent_cover_letters_by_user_excluding_application(
        &self,
        user_id: &str,
        exclude_application_id: &str,
        limit: i64,
    ) -> DomainResult<Vec<DocumentDraft>> {
        let owners = self.owners.lock().unwrap().clone();
        let trashed = self.trashed.lock().unwrap().clone();
        let mut drafts: Vec<DocumentDraft> = self
            .all()
            .into_iter()
            .filter(|draft| {
                owners.get(&draft.application_id).is_some_and(|owner| owner == user_id)
                    && draft.draft_type == DocumentDraftType::CoverLetter
                    && draft.application_id != exclude_application_id
                    && !trashed.contains(&draft.application_id)
            })
            .collect();
        drafts.sort_by_key(|draft| Reverse(draft.updated_at));
        drafts.truncate(limit.max(0) as usize);
        Ok(drafts)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn data(
        id: &str,
        application_id: &str,
        draft_type: DocumentDraftType,
    ) -> CreateDocumentDraftData {
        CreateDocumentDraftData {
            id: id.to_string(),
            application_id: application_id.to_string(),
            draft_type,
            title: format!("title of {id}"),
            content_json: None,
            plain_text: None,
            source_document_id: None,
        }
    }

    #[tokio::test]
    async fn a_new_draft_gets_the_column_defaults() {
        let drafts = FakeDocumentDraftRepository::default();
        let created = drafts.create(data("d1", "app-1", DocumentDraftType::Resume)).await.unwrap();
        assert_eq!(created.content_json, "{}");
        assert_eq!(created.plain_text, "");
    }

    #[tokio::test]
    async fn recent_cover_letters_skip_resumes_and_excluded_trashed_and_foreign_applications() {
        let drafts = FakeDocumentDraftRepository::default()
            .owned_by("app-1", "user-1")
            .owned_by("app-other", "user-1")
            .owned_by("app-trashed", "user-1")
            .owned_by("app-foreign", "user-2")
            .trashed("app-trashed");
        for (id, application_id, draft_type) in [
            ("current", "app-1", DocumentDraftType::CoverLetter),
            ("wanted", "app-other", DocumentDraftType::CoverLetter),
            ("resume", "app-other", DocumentDraftType::Resume),
            ("trashed", "app-trashed", DocumentDraftType::CoverLetter),
            ("foreign", "app-foreign", DocumentDraftType::CoverLetter),
        ] {
            drafts.create(data(id, application_id, draft_type)).await.unwrap();
        }

        let recent = drafts
            .find_recent_cover_letters_by_user_excluding_application("user-1", "app-1", 10)
            .await
            .unwrap();

        let ids: Vec<&str> = recent.iter().map(|draft| draft.id.as_str()).collect();
        assert_eq!(ids, vec!["wanted"]);
    }
}
