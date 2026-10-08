use async_graphql::{SimpleObject, ID};

use super::support::iso;
use crate::domain::document_draft::DocumentDraft;

#[derive(SimpleObject)]
#[graphql(name = "DocumentDraft")]
pub struct DocumentDraftObject {
    id: Option<ID>,
    application_id: Option<ID>,
    #[graphql(name = "type")]
    draft_type: Option<String>,
    title: Option<String>,
    content_json: Option<String>,
    plain_text: Option<String>,
    source_document_id: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

impl From<DocumentDraft> for DocumentDraftObject {
    fn from(draft: DocumentDraft) -> Self {
        Self {
            id: Some(ID(draft.id)),
            application_id: Some(ID(draft.application_id)),
            draft_type: Some(draft.draft_type.as_str().to_string()),
            title: Some(draft.title),
            content_json: Some(draft.content_json),
            plain_text: Some(draft.plain_text),
            source_document_id: draft.source_document_id,
            created_at: Some(iso(draft.created_at)),
            updated_at: Some(iso(draft.updated_at)),
        }
    }
}
