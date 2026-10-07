use std::sync::Arc;

use chrono::{DateTime, Utc};

use crate::domain::application::{Application, ApplicationStatus};
use crate::use_cases::constants::defaults;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{ApplicationRepository, ApplicationTagData, CreateApplicationData};

#[derive(Debug, Clone, Default)]
pub struct CreateApplicationInput {
    pub user_id: String,
    pub company: String,
    pub role: String,
    pub status: Option<ApplicationStatus>,
    pub job_url: Option<String>,
    pub location: Option<String>,
    pub salary_range: Option<String>,
    pub description: Option<String>,
    pub starred: Option<bool>,
    pub source: Option<String>,
    pub follow_up_at: Option<DateTime<Utc>>,
    pub tags: Option<Vec<String>>,
}

pub struct CreateApplicationUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub generate_id: GenerateId,
}

impl CreateApplicationUseCase {
    pub async fn execute(&self, input: CreateApplicationInput) -> DomainResult<Application> {
        let tags = input
            .tags
            .unwrap_or_default()
            .into_iter()
            .map(|name| ApplicationTagData { id: (self.generate_id)(), name })
            .collect();

        self.application_repository
            .create(CreateApplicationData {
                id: (self.generate_id)(),
                user_id: input.user_id,
                company: input.company,
                role: input.role,
                status: input.status.unwrap_or(defaults::APPLICATION_STATUS),
                job_url: input.job_url,
                location: input.location,
                salary_range: input.salary_range,
                description: input.description,
                starred: Some(input.starred.unwrap_or(false)),
                source: input.source,
                follow_up_at: input.follow_up_at,
                tags,
            })
            .await
    }
}
