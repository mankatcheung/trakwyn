//! Credentials, the account email and its backup, account deletion, and the
//! export/import of a user's data.

use async_graphql::{Context, Object, Result, SimpleObject};
use serde::Serialize;

use super::session_auth_time::{clear_auth_cookies, device, session_auth_time};
use super::support::{container, iso, require_user};
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::errors::DomainError;
use crate::use_cases::user::{
    ConfirmBackupEmailInput, ConfirmEmailChangeInput, DeleteAccountInput, ExportUserDataOutput,
    ImportSummary, RemoveBackupEmailInput, RequestAddBackupEmailInput, RequestEmailChangeInput,
    UpdatePasswordInput,
};

#[derive(SimpleObject)]
#[graphql(name = "ImportSummary")]
pub struct ImportSummaryObject {
    applications_imported: Option<i32>,
    applications_skipped: Option<i32>,
    notes_imported: Option<i32>,
    documents_skipped: Option<i32>,
}

impl From<ImportSummary> for ImportSummaryObject {
    fn from(summary: ImportSummary) -> Self {
        Self {
            applications_imported: Some(summary.applications_imported),
            applications_skipped: Some(summary.applications_skipped),
            notes_imported: Some(summary.notes_imported),
            documents_skipped: Some(summary.documents_skipped),
        }
    }
}

// The export document. Users keep these files and feed them back to
// `importUserData`, of either implementation, so the keys, their order and
// the timestamp format are `apps/api`'s: fields serialise in declaration
// order, which is the order `apps/api` builds the object in.

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportNoteJson {
    content: String,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportDocumentJson {
    name: String,
    mime_type: String,
    size_bytes: i32,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportApplicationJson {
    company: String,
    role: String,
    status: &'static str,
    job_url: Option<String>,
    location: Option<String>,
    salary_range: Option<String>,
    description: Option<String>,
    applied_at: Option<String>,
    created_at: String,
    notes: Vec<ExportNoteJson>,
    documents: Vec<ExportDocumentJson>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportUserJson {
    email: String,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportJson {
    exported_at: String,
    user: ExportUserJson,
    applications: Vec<ExportApplicationJson>,
}

/// `JSON.stringify(data, null, 2)` of the export.
pub fn export_document(output: ExportUserDataOutput) -> Result<String, DomainError> {
    let document = ExportJson {
        exported_at: iso(output.exported_at),
        user: ExportUserJson { email: output.user.email, created_at: iso(output.user.created_at) },
        applications: output
            .applications
            .into_iter()
            .map(|app| ExportApplicationJson {
                company: app.company,
                role: app.role,
                status: app.status.as_str(),
                job_url: app.job_url,
                location: app.location,
                salary_range: app.salary_range,
                description: app.description,
                applied_at: app.applied_at.map(iso),
                created_at: iso(app.created_at),
                notes: app
                    .notes
                    .into_iter()
                    .map(|note| ExportNoteJson {
                        content: note.content,
                        created_at: iso(note.created_at),
                    })
                    .collect(),
                documents: app
                    .documents
                    .into_iter()
                    .map(|document| ExportDocumentJson {
                        name: document.name,
                        mime_type: document.mime_type,
                        size_bytes: document.size_bytes,
                        created_at: iso(document.created_at),
                    })
                    .collect(),
            })
            .collect(),
    };
    // serde_json's pretty printer indents by two spaces and prints an empty
    // array as `[]`, as `JSON.stringify` does.
    serde_json::to_string_pretty(&document).map_err(DomainError::internal)
}

#[derive(Default)]
pub struct AccountQuery;

#[Object]
impl AccountQuery {
    async fn export_user_data(&self, ctx: &Context<'_>) -> Result<Option<String>> {
        let user = require_user(ctx)?;
        let output = container(ctx).export_user_data_use_case().execute(&user.sub).await.gql()?;
        Ok(Some(export_document(output).gql()?))
    }
}

#[derive(Default)]
pub struct AccountMutation;

#[Object]
impl AccountMutation {
    async fn update_password(
        &self,
        ctx: &Context<'_>,
        current_password: String,
        new_password: String,
    ) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        let (ip_address, user_agent) = device(ctx);
        container(ctx)
            .update_password_use_case()
            .execute(UpdatePasswordInput {
                user_id: user.sub.clone(),
                current_password,
                new_password,
                auth_time: session_auth_time(user),
                ip_address,
                user_agent,
            })
            .await
            .gql()?;
        Ok(Some(true))
    }

    async fn delete_account(&self, ctx: &Context<'_>, password: String) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .delete_account_use_case()
            .execute(DeleteAccountInput {
                user_id: user.sub.clone(),
                password,
                auth_time: session_auth_time(user),
            })
            .await
            .gql()?;
        clear_auth_cookies(ctx);
        Ok(Some(true))
    }

    async fn request_email_change(
        &self,
        ctx: &Context<'_>,
        current_password: String,
        new_email: String,
    ) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .request_email_change_use_case()
            .execute(RequestEmailChangeInput {
                user_id: user.sub.clone(),
                current_password,
                new_email,
                auth_time: session_auth_time(user),
            })
            .await
            .gql()?;
        Ok(Some(true))
    }

    // Unauthenticated: the link is opened from the new inbox, possibly in a
    // browser that is not signed in. The token is the credential.
    async fn confirm_email_change(&self, ctx: &Context<'_>, token: String) -> Result<Option<bool>> {
        let (ip_address, user_agent) = device(ctx);
        container(ctx)
            .confirm_email_change_use_case()
            .execute(ConfirmEmailChangeInput { token, ip_address, user_agent })
            .await
            .gql()?;
        Ok(Some(true))
    }

    async fn request_add_backup_email(
        &self,
        ctx: &Context<'_>,
        current_password: String,
        backup_email: String,
    ) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .request_add_backup_email_use_case()
            .execute(RequestAddBackupEmailInput {
                user_id: user.sub.clone(),
                backup_email,
                current_password,
                auth_time: session_auth_time(user),
            })
            .await
            .gql()?;
        Ok(Some(true))
    }

    // Unauthenticated, like `confirmEmailChange`.
    async fn confirm_backup_email(&self, ctx: &Context<'_>, token: String) -> Result<Option<bool>> {
        container(ctx)
            .confirm_backup_email_use_case()
            .execute(ConfirmBackupEmailInput { token })
            .await
            .gql()?;
        Ok(Some(true))
    }

    async fn remove_backup_email(
        &self,
        ctx: &Context<'_>,
        current_password: String,
    ) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .remove_backup_email_use_case()
            .execute(RemoveBackupEmailInput {
                user_id: user.sub.clone(),
                current_password,
                auth_time: session_auth_time(user),
            })
            .await
            .gql()?;
        Ok(Some(true))
    }

    async fn import_user_data(
        &self,
        ctx: &Context<'_>,
        data: String,
    ) -> Result<Option<ImportSummaryObject>> {
        let user = require_user(ctx)?;
        let summary =
            container(ctx).import_user_data_use_case().execute(&user.sub, &data).await.gql()?;
        Ok(Some(summary.into()))
    }
}
