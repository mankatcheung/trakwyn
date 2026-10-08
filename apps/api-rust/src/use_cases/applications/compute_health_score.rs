use std::sync::Arc;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{
    ApplicationRepository, ContactRepository, DocumentRepository, InterviewRoundRepository,
    NoteRepository,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HealthScoreCriterion {
    pub key: &'static str,
    pub label: &'static str,
    pub points: i32,
    pub earned: i32,
    pub met: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HealthScore {
    pub score: i32,
    pub label: &'static str,
    pub criteria: Vec<HealthScoreCriterion>,
}

/// Key, label and points, in the order the breakdown lists them.
const CRITERIA: [(&str, &str, i32); 11] = [
    ("description", "Job description captured", 20),
    ("appliedAt", "Applied date logged", 15),
    ("hasNotes", "Notes added", 10),
    ("hasDocuments", "Documents attached", 10),
    ("followUpAt", "Follow-up date planned", 10),
    ("hasInterviews", "Interview rounds tracked", 10),
    ("jobUrl", "Job URL saved", 5),
    ("salaryRange", "Salary range noted", 5),
    ("location", "Location noted", 5),
    ("source", "Source tracked", 5),
    ("hasContacts", "Contact tracked", 5),
];

fn score_label(score: i32) -> &'static str {
    match score {
        91.. => "Complete",
        71.. => "Looking good",
        41.. => "In progress",
        _ => "Needs attention",
    }
}

pub struct ComputeHealthScoreUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub note_repository: Arc<dyn NoteRepository>,
    pub document_repository: Arc<dyn DocumentRepository>,
    pub interview_round_repository: Arc<dyn InterviewRoundRepository>,
    pub contact_repository: Arc<dyn ContactRepository>,
}

impl ComputeHealthScoreUseCase {
    pub async fn execute(&self, application_id: &str, user_id: &str) -> DomainResult<HealthScore> {
        let application = self
            .application_repository
            .find_by_id(application_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Application not found"))?;
        if application.user_id != user_id {
            return Err(DomainError::forbidden("Forbidden"));
        }

        let (notes, documents, rounds, contacts) = tokio::try_join!(
            self.note_repository.find_all_by_application_id(application_id),
            self.document_repository.find_all_by_application_id(application_id),
            self.interview_round_repository.find_all_by_application_id(application_id),
            self.contact_repository.find_all_by_application_id(application_id),
        )?;

        let filled = |field: &Option<String>| field.as_deref().is_some_and(|text| !text.is_empty());
        let is_met = |key: &str| match key {
            "description" => {
                application.description.as_deref().is_some_and(|text| !text.trim().is_empty())
            }
            "appliedAt" => application.applied_at.is_some(),
            "followUpAt" => application.follow_up_at.is_some(),
            "jobUrl" => filled(&application.job_url),
            "salaryRange" => filled(&application.salary_range),
            "location" => filled(&application.location),
            "source" => filled(&application.source),
            "hasNotes" => !notes.is_empty(),
            "hasDocuments" => !documents.is_empty(),
            "hasInterviews" => !rounds.is_empty(),
            "hasContacts" => !contacts.is_empty(),
            _ => false,
        };

        let criteria: Vec<HealthScoreCriterion> = CRITERIA
            .iter()
            .map(|&(key, label, points)| {
                let met = is_met(key);
                HealthScoreCriterion {
                    key,
                    label,
                    points,
                    earned: if met { points } else { 0 },
                    met,
                }
            })
            .collect();
        let score = criteria.iter().map(|criterion| criterion.earned).sum();

        Ok(HealthScore { score, label: score_label(score), criteria })
    }
}
