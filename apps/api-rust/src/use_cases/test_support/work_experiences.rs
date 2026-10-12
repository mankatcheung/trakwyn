use std::cmp::Reverse;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::work_experience::WorkExperience;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{
    CreateWorkExperienceData, UpdateWorkExperienceData, WorkExperienceRepository,
};

#[derive(Default)]
pub struct FakeWorkExperienceRepository {
    work_experiences: Mutex<Vec<WorkExperience>>,
}

impl FakeWorkExperienceRepository {
    pub fn with(work_experiences: Vec<WorkExperience>) -> Self {
        Self { work_experiences: Mutex::new(work_experiences) }
    }

    pub fn all(&self) -> Vec<WorkExperience> {
        self.work_experiences.lock().unwrap().clone()
    }
}

#[async_trait]
impl WorkExperienceRepository for FakeWorkExperienceRepository {
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<WorkExperience>> {
        let mut work_experiences: Vec<WorkExperience> =
            self.all().into_iter().filter(|experience| experience.user_id == user_id).collect();
        work_experiences
            .sort_by_key(|experience| Reverse((experience.start_date, experience.id.clone())));
        Ok(work_experiences)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<WorkExperience>> {
        Ok(self.all().into_iter().find(|experience| experience.id == id))
    }

    async fn create(&self, data: CreateWorkExperienceData) -> DomainResult<WorkExperience> {
        let timestamp = now();
        let experience = WorkExperience {
            id: data.id,
            user_id: data.user_id,
            company: data.company,
            title: data.title,
            location: data.location,
            start_date: data.start_date,
            end_date: data.end_date,
            description: data.description,
            created_at: timestamp,
            updated_at: timestamp,
        };
        self.work_experiences.lock().unwrap().push(experience.clone());
        Ok(experience)
    }

    async fn update(
        &self,
        id: &str,
        data: UpdateWorkExperienceData,
    ) -> DomainResult<WorkExperience> {
        let mut work_experiences = self.work_experiences.lock().unwrap();
        let experience = work_experiences
            .iter_mut()
            .find(|experience| experience.id == id)
            .ok_or_else(|| DomainError::not_found("Work experience not found"))?;
        if let Some(company) = data.company {
            experience.company = company;
        }
        if let Some(title) = data.title {
            experience.title = title;
        }
        if let Some(location) = data.location {
            experience.location = location;
        }
        if let Some(start_date) = data.start_date {
            experience.start_date = start_date;
        }
        if let Some(end_date) = data.end_date {
            experience.end_date = end_date;
        }
        if let Some(description) = data.description {
            experience.description = description;
        }
        experience.updated_at = now();
        Ok(experience.clone())
    }

    async fn delete(&self, id: &str, _user_id: &str) -> DomainResult<()> {
        self.work_experiences.lock().unwrap().retain(|experience| experience.id != id);
        Ok(())
    }
}
