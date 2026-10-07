use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::company_briefing::CompanyBriefing;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CompanyBriefingRepository, UpsertCompanyBriefingData};

#[derive(Default)]
pub struct FakeCompanyBriefingRepository {
    briefings: Mutex<Vec<CompanyBriefing>>,
}

impl FakeCompanyBriefingRepository {
    pub fn with(briefings: Vec<CompanyBriefing>) -> Self {
        Self { briefings: Mutex::new(briefings) }
    }

    pub fn all(&self) -> Vec<CompanyBriefing> {
        self.briefings.lock().unwrap().clone()
    }
}

#[async_trait]
impl CompanyBriefingRepository for FakeCompanyBriefingRepository {
    async fn find_by_application_id(
        &self,
        application_id: &str,
    ) -> DomainResult<Option<CompanyBriefing>> {
        Ok(self.all().into_iter().find(|briefing| briefing.application_id == application_id))
    }

    async fn upsert(&self, data: UpsertCompanyBriefingData) -> DomainResult<CompanyBriefing> {
        let mut briefings = self.briefings.lock().unwrap();
        // The conflict target is the application: the existing row keeps its
        // id and takes the new content.
        if let Some(existing) =
            briefings.iter_mut().find(|briefing| briefing.application_id == data.application_id)
        {
            existing.content = data.content;
            existing.generated_at = data.generated_at;
            return Ok(existing.clone());
        }

        let briefing = CompanyBriefing {
            id: data.id,
            application_id: data.application_id,
            content: data.content,
            generated_at: data.generated_at,
        };
        briefings.push(briefing.clone());
        Ok(briefing)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::clock::now;

    #[tokio::test]
    async fn regenerating_replaces_the_applications_briefing() {
        let repository = FakeCompanyBriefingRepository::default();
        let data = |id: &str, content: &str| UpsertCompanyBriefingData {
            id: id.to_string(),
            application_id: "app-1".to_string(),
            content: content.to_string(),
            generated_at: now(),
        };

        repository.upsert(data("b1", "First")).await.unwrap();
        let second = repository.upsert(data("b2", "Second")).await.unwrap();

        assert_eq!(second.id, "b1");
        assert_eq!(repository.all(), vec![second.clone()]);
        assert_eq!(repository.find_by_application_id("app-1").await.unwrap(), Some(second));
        assert_eq!(repository.find_by_application_id("app-2").await.unwrap(), None);
    }
}
