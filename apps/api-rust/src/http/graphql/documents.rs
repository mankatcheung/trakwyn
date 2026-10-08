use async_graphql::{Context, InputObject, Object, Result, SimpleObject, ID};
use futures::future::try_join_all;

use super::support::{container, iso, require_user};
use super::upload_url_payload::UploadUrlPayloadObject;
use crate::domain::document::Document;
use crate::http::container::Container;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::documents::{
    ConfirmDocumentInput, DeleteDocumentInput, DocumentVersionOutcome,
    GetDocumentVersionOutcomesInput, GetDocumentsInput, RequestUploadUrlInput,
};
use crate::use_cases::errors::DomainResult;

#[derive(SimpleObject)]
#[graphql(name = "Document")]
pub struct DocumentObject {
    id: Option<ID>,
    application_id: Option<ID>,
    name: Option<String>,
    mime_type: Option<String>,
    size_bytes: Option<i32>,
    url: Option<String>,
    document_type: Option<String>,
    version: Option<String>,
    source_draft_id: Option<String>,
    created_at: Option<String>,
}

impl DocumentObject {
    fn new(document: Document, signed_url: String) -> Self {
        Self {
            id: Some(ID(document.id)),
            application_id: Some(ID(document.application_id)),
            name: Some(document.name),
            mime_type: Some(document.mime_type),
            size_bytes: Some(document.size_bytes),
            url: Some(signed_url),
            document_type: Some(document.document_type),
            version: document.version,
            source_draft_id: document.source_draft_id,
            created_at: Some(iso(document.created_at)),
        }
    }

    /// The document with a freshly signed read URL as its `url`: the storage
    /// provider is asked once per document, every time one is sent.
    pub async fn signed(container: &Container, document: Document) -> DomainResult<Self> {
        let url =
            container.services.storage_provider.get_signed_url(&document.storage_key, None).await?;
        Ok(Self::new(document, url))
    }
}

#[derive(SimpleObject)]
#[graphql(name = "DocumentVersionOutcome")]
pub struct DocumentVersionOutcomeObject {
    document_type: Option<String>,
    version: Option<String>,
    application_count: Option<i32>,
    interview_count: Option<i32>,
    interview_rate: Option<i32>,
}

impl From<DocumentVersionOutcome> for DocumentVersionOutcomeObject {
    fn from(outcome: DocumentVersionOutcome) -> Self {
        Self {
            document_type: Some(outcome.document_type),
            version: outcome.version,
            application_count: Some(outcome.application_count),
            interview_count: Some(outcome.interview_count),
            interview_rate: Some(outcome.interview_rate),
        }
    }
}

#[derive(InputObject)]
#[graphql(name = "RequestUploadUrlInput")]
pub struct RequestUploadUrlInputObject {
    application_id: ID,
    filename: String,
    mime_type: String,
}

#[derive(InputObject)]
#[graphql(name = "ConfirmDocumentInput")]
pub struct ConfirmDocumentInputObject {
    application_id: ID,
    storage_key: String,
    name: String,
    mime_type: String,
    size_bytes: i32,
    document_type: Option<String>,
    version: Option<String>,
}

#[derive(Default)]
pub struct DocumentsQuery;

#[Object]
impl DocumentsQuery {
    async fn documents(
        &self,
        ctx: &Context<'_>,
        application_id: ID,
    ) -> Result<Option<Vec<DocumentObject>>> {
        let user = require_user(ctx)?;
        let container = container(ctx);
        let documents = container
            .get_documents_use_case()
            .execute(GetDocumentsInput {
                user_id: user.sub.clone(),
                application_id: application_id.0,
            })
            .await
            .gql()?;
        let documents = try_join_all(
            documents.into_iter().map(|document| DocumentObject::signed(container, document)),
        )
        .await
        .gql()?;
        Ok(Some(documents))
    }

    async fn document_version_outcomes(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<Vec<DocumentVersionOutcomeObject>>> {
        let user = require_user(ctx)?;
        let outcomes = container(ctx)
            .get_document_version_outcomes_use_case()
            .execute(GetDocumentVersionOutcomesInput { user_id: user.sub.clone() })
            .await
            .gql()?;
        Ok(Some(outcomes.into_iter().map(DocumentVersionOutcomeObject::from).collect()))
    }
}

#[derive(Default)]
pub struct DocumentsMutation;

#[Object]
impl DocumentsMutation {
    async fn request_upload_url(
        &self,
        ctx: &Context<'_>,
        input: RequestUploadUrlInputObject,
    ) -> Result<Option<UploadUrlPayloadObject>> {
        let user = require_user(ctx)?;
        let output = container(ctx)
            .request_upload_url_use_case()
            .execute(RequestUploadUrlInput {
                user_id: user.sub.clone(),
                application_id: input.application_id.0,
                filename: input.filename,
                mime_type: input.mime_type,
            })
            .await
            .gql()?;
        Ok(Some(UploadUrlPayloadObject {
            upload_url: Some(output.upload_url),
            storage_key: Some(output.storage_key),
        }))
    }

    async fn confirm_document(
        &self,
        ctx: &Context<'_>,
        input: ConfirmDocumentInputObject,
    ) -> Result<Option<DocumentObject>> {
        let user = require_user(ctx)?;
        let container = container(ctx);
        let document = container
            .confirm_document_use_case()
            .execute(ConfirmDocumentInput {
                user_id: user.sub.clone(),
                application_id: input.application_id.0,
                storage_key: input.storage_key,
                name: input.name,
                mime_type: input.mime_type,
                size_bytes: input.size_bytes,
                document_type: input.document_type,
                version: input.version,
            })
            .await
            .gql()?;
        Ok(Some(DocumentObject::signed(container, document).await.gql()?))
    }

    async fn delete_document(&self, ctx: &Context<'_>, id: ID) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .delete_document_use_case()
            .execute(DeleteDocumentInput { user_id: user.sub.clone(), document_id: id.0 })
            .await
            .gql()?;
        Ok(Some(true))
    }
}
