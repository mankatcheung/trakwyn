use std::sync::Arc;

use chrono::{DateTime, Utc};

use crate::domain::application::ApplicationStatus;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{
    ApplicationRepository, DocumentRepository, FindApplicationsFilters, NoteRepository,
    UserRepository,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportedNote {
    pub content: String,
    pub created_at: DateTime<Utc>,
}

/// A document's metadata only: the file itself is not part of an export.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportedDocument {
    pub name: String,
    pub mime_type: String,
    pub size_bytes: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportedApplication {
    pub company: String,
    pub role: String,
    pub status: ApplicationStatus,
    pub job_url: Option<String>,
    pub location: Option<String>,
    pub salary_range: Option<String>,
    pub description: Option<String>,
    pub applied_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub notes: Vec<ExportedNote>,
    pub documents: Vec<ExportedDocument>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportedUser {
    pub email: String,
    pub created_at: DateTime<Utc>,
}

/// The fields are declared in the order the exported JSON document lists
/// them; the transport serialises them in this order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportUserDataOutput {
    pub exported_at: DateTime<Utc>,
    pub user: ExportedUser,
    pub applications: Vec<ExportedApplication>,
}

pub struct ExportUserDataUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub note_repository: Arc<dyn NoteRepository>,
    pub document_repository: Arc<dyn DocumentRepository>,
}

impl ExportUserDataUseCase {
    pub async fn execute(&self, user_id: &str) -> DomainResult<ExportUserDataOutput> {
        let user = self
            .user_repository
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;

        // Live applications only, newest first; Trash is not exported.
        let applications = self
            .application_repository
            .find_all_by_user_id(user_id, FindApplicationsFilters::default())
            .await?;

        let mut exported = Vec::with_capacity(applications.len());
        for app in applications {
            let notes = self.note_repository.find_all_by_application_id(&app.id).await?;
            let documents = self.document_repository.find_all_by_application_id(&app.id).await?;

            exported.push(ExportedApplication {
                company: app.company,
                role: app.role,
                status: app.status,
                job_url: app.job_url,
                location: app.location,
                salary_range: app.salary_range,
                description: app.description,
                applied_at: app.applied_at,
                created_at: app.created_at,
                notes: notes
                    .into_iter()
                    .map(|note| ExportedNote { content: note.content, created_at: note.created_at })
                    .collect(),
                documents: documents
                    .into_iter()
                    .map(|document| ExportedDocument {
                        name: document.name,
                        mime_type: document.mime_type,
                        size_bytes: document.size_bytes,
                        created_at: document.created_at,
                    })
                    .collect(),
            });
        }

        Ok(ExportUserDataOutput {
            exported_at: now(),
            user: ExportedUser { email: user.email, created_at: user.created_at },
            applications: exported,
        })
    }
}
