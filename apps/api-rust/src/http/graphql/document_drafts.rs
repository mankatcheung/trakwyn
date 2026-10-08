use async_graphql::{Context, InputObject, Object, Result, SimpleObject, ID};

use super::documents::DocumentObject;
use super::support::{container, iso, require_user};
use crate::domain::document_draft::{DocumentDraft, DocumentDraftType};
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::documents::{
    CreateDocumentDraftInput, DeleteDocumentDraftInput, ExportDocumentDraftToPdfInput,
    ExtractDocumentTextInput, GetDocumentDraftInput, GetDocumentDraftsInput,
    RenameDocumentDraftInput, UpdateDocumentDraftContentInput,
};
use crate::use_cases::errors::DomainError;

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

#[derive(SimpleObject)]
#[graphql(name = "ExtractDocumentTextPayload")]
pub struct ExtractDocumentTextPayloadObject {
    text: Option<String>,
}

#[derive(InputObject)]
#[graphql(name = "CreateDocumentDraftInput")]
pub struct CreateDocumentDraftInputObject {
    application_id: ID,
    #[graphql(name = "type")]
    draft_type: String,
    title: String,
    content_json: Option<String>,
    plain_text: Option<String>,
    source_document_id: Option<ID>,
}

#[derive(InputObject)]
#[graphql(name = "UpdateDocumentDraftContentInput")]
pub struct UpdateDocumentDraftContentInputObject {
    draft_id: ID,
    content_json: String,
    plain_text: String,
}

#[derive(Default)]
pub struct DocumentDraftsQuery;

#[Object]
impl DocumentDraftsQuery {
    async fn document_drafts(
        &self,
        ctx: &Context<'_>,
        application_id: ID,
    ) -> Result<Option<Vec<DocumentDraftObject>>> {
        let user = require_user(ctx)?;
        let drafts = container(ctx)
            .get_document_drafts_use_case()
            .execute(GetDocumentDraftsInput {
                user_id: user.sub.clone(),
                application_id: application_id.0,
            })
            .await
            .gql()?;
        Ok(Some(drafts.into_iter().map(DocumentDraftObject::from).collect()))
    }

    async fn document_draft(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> Result<Option<DocumentDraftObject>> {
        let user = require_user(ctx)?;
        let draft = container(ctx)
            .get_document_draft_use_case()
            .execute(GetDocumentDraftInput { user_id: user.sub.clone(), draft_id: id.0 })
            .await
            .gql()?;
        Ok(Some(draft.into()))
    }
}

#[derive(Default)]
pub struct DocumentDraftsMutation;

#[Object]
impl DocumentDraftsMutation {
    async fn create_document_draft(
        &self,
        ctx: &Context<'_>,
        input: CreateDocumentDraftInputObject,
    ) -> Result<Option<DocumentDraftObject>> {
        let user = require_user(ctx)?;
        // `apps/api` stores whatever string arrives. Here the column is read
        // back through `DocumentDraftType`, so a value outside it is refused
        // rather than stored as a row no query could return.
        let draft_type = DocumentDraftType::parse(&input.draft_type)
            .ok_or_else(|| DomainError::validation("Invalid document draft type"))
            .gql()?;
        let draft = container(ctx)
            .create_document_draft_use_case()
            .execute(CreateDocumentDraftInput {
                user_id: user.sub.clone(),
                application_id: input.application_id.0,
                draft_type,
                title: input.title,
                content_json: input.content_json,
                plain_text: input.plain_text,
                source_document_id: input.source_document_id.map(|id| id.0),
            })
            .await
            .gql()?;
        Ok(Some(draft.into()))
    }

    async fn update_document_draft_content(
        &self,
        ctx: &Context<'_>,
        input: UpdateDocumentDraftContentInputObject,
    ) -> Result<Option<DocumentDraftObject>> {
        let user = require_user(ctx)?;
        let draft = container(ctx)
            .update_document_draft_content_use_case()
            .execute(UpdateDocumentDraftContentInput {
                user_id: user.sub.clone(),
                draft_id: input.draft_id.0,
                content_json: input.content_json,
                plain_text: input.plain_text,
            })
            .await
            .gql()?;
        Ok(Some(draft.into()))
    }

    async fn rename_document_draft(
        &self,
        ctx: &Context<'_>,
        draft_id: ID,
        title: String,
    ) -> Result<Option<DocumentDraftObject>> {
        let user = require_user(ctx)?;
        let draft = container(ctx)
            .rename_document_draft_use_case()
            .execute(RenameDocumentDraftInput {
                user_id: user.sub.clone(),
                draft_id: draft_id.0,
                title,
            })
            .await
            .gql()?;
        Ok(Some(draft.into()))
    }

    async fn delete_document_draft(&self, ctx: &Context<'_>, id: ID) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .delete_document_draft_use_case()
            .execute(DeleteDocumentDraftInput { user_id: user.sub.clone(), draft_id: id.0 })
            .await
            .gql()?;
        Ok(Some(true))
    }

    async fn export_document_draft_to_pdf(
        &self,
        ctx: &Context<'_>,
        draft_id: ID,
    ) -> Result<Option<DocumentObject>> {
        let user = require_user(ctx)?;
        let container = container(ctx);
        let document = container
            .export_document_draft_to_pdf_use_case()
            .execute(ExportDocumentDraftToPdfInput {
                user_id: user.sub.clone(),
                draft_id: draft_id.0,
            })
            .await
            .gql()?;
        Ok(Some(DocumentObject::signed(container, document).await.gql()?))
    }

    async fn extract_document_text(
        &self,
        ctx: &Context<'_>,
        document_id: ID,
    ) -> Result<Option<ExtractDocumentTextPayloadObject>> {
        let user = require_user(ctx)?;
        let output = container(ctx)
            .extract_document_text_use_case()
            .execute(ExtractDocumentTextInput {
                user_id: user.sub.clone(),
                document_id: document_id.0,
            })
            .await
            .gql()?;
        Ok(Some(ExtractDocumentTextPayloadObject { text: Some(output.text) }))
    }
}
