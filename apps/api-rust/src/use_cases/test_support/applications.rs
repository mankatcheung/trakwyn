use std::sync::Mutex;

use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::application::{Application, ApplicationStatus};
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::ApplicationRepository;

/// A live application with unremarkable field values.
pub fn application_owned_by(id: &str, user_id: &str) -> Application {
    let epoch = DateTime::<Utc>::UNIX_EPOCH;
    Application {
        id: id.to_string(),
        user_id: user_id.to_string(),
        company: "Acme".to_string(),
        role: "Engineer".to_string(),
        status: ApplicationStatus::Applied,
        job_url: None,
        location: None,
        salary_range: None,
        description: None,
        applied_at: None,
        starred: false,
        source: None,
        follow_up_at: None,
        tags: Vec::new(),
        reminder_sent_at: None,
        board_position: 0,
        deleted_at: None,
        created_at: epoch,
        updated_at: epoch,
    }
}

#[derive(Default)]
pub struct FakeApplicationRepository {
    applications: Mutex<Vec<Application>>,
}

impl FakeApplicationRepository {
    pub fn with(applications: Vec<Application>) -> Self {
        Self { applications: Mutex::new(applications) }
    }
}

#[async_trait]
impl ApplicationRepository for FakeApplicationRepository {
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Application>> {
        let applications = self.applications.lock().unwrap();
        Ok(applications
            .iter()
            .find(|application| application.id == id && application.deleted_at.is_none())
            .cloned())
    }
}
