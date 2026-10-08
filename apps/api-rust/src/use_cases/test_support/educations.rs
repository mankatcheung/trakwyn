use std::cmp::Reverse;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::education::Education;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{CreateEducationData, EducationRepository, UpdateEducationData};

#[derive(Default)]
pub struct FakeEducationRepository {
    educations: Mutex<Vec<Education>>,
}

impl FakeEducationRepository {
    pub fn with(educations: Vec<Education>) -> Self {
        Self { educations: Mutex::new(educations) }
    }

    pub fn all(&self) -> Vec<Education> {
        self.educations.lock().unwrap().clone()
    }
}

#[async_trait]
impl EducationRepository for FakeEducationRepository {
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Education>> {
        let mut educations: Vec<Education> =
            self.all().into_iter().filter(|education| education.user_id == user_id).collect();
        educations.sort_by_key(|education| Reverse((education.start_date, education.id.clone())));
        Ok(educations)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Education>> {
        Ok(self.all().into_iter().find(|education| education.id == id))
    }

    async fn create(&self, data: CreateEducationData) -> DomainResult<Education> {
        let timestamp = now();
        let education = Education {
            id: data.id,
            user_id: data.user_id,
            institution: data.institution,
            degree: data.degree,
            field: data.field,
            start_date: data.start_date,
            end_date: data.end_date,
            description: data.description,
            created_at: timestamp,
            updated_at: timestamp,
        };
        self.educations.lock().unwrap().push(education.clone());
        Ok(education)
    }

    async fn update(&self, id: &str, data: UpdateEducationData) -> DomainResult<Education> {
        let mut educations = self.educations.lock().unwrap();
        let education = educations
            .iter_mut()
            .find(|education| education.id == id)
            .ok_or_else(|| DomainError::not_found("Education not found"))?;
        if let Some(institution) = data.institution {
            education.institution = institution;
        }
        if let Some(degree) = data.degree {
            education.degree = degree;
        }
        if let Some(field) = data.field {
            education.field = field;
        }
        if let Some(start_date) = data.start_date {
            education.start_date = start_date;
        }
        if let Some(end_date) = data.end_date {
            education.end_date = end_date;
        }
        if let Some(description) = data.description {
            education.description = description;
        }
        education.updated_at = now();
        Ok(education.clone())
    }

    async fn delete(&self, id: &str, _user_id: &str) -> DomainResult<()> {
        self.educations.lock().unwrap().retain(|education| education.id != id);
        Ok(())
    }
}
