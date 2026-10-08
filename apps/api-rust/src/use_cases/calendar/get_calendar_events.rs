use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};

use crate::domain::application::Application;
use crate::domain::interview_round::InterviewRoundType;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{
    ApplicationRepository, FindApplicationsFilters, InterviewRoundRepository,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CalendarEventType {
    Applied,
    FollowUp,
    Interview,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CalendarEvent {
    pub id: String,
    pub application_id: String,
    pub company: String,
    pub role: String,
    pub r#type: CalendarEventType,
    pub date: DateTime<Utc>,
    /// Set on interview events only.
    pub interview_round_type: Option<InterviewRoundType>,
}

pub struct GetCalendarEventsInput {
    pub user_id: String,
}

pub struct GetCalendarEventsUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub interview_round_repository: Arc<dyn InterviewRoundRepository>,
}

fn event(
    id: String,
    application: &Application,
    r#type: CalendarEventType,
    date: DateTime<Utc>,
    interview_round_type: Option<InterviewRoundType>,
) -> CalendarEvent {
    CalendarEvent {
        id,
        application_id: application.id.clone(),
        company: application.company.clone(),
        role: application.role.clone(),
        r#type,
        date,
        interview_round_type,
    }
}

impl GetCalendarEventsUseCase {
    /// Every dated thing across the user's live applications, earliest first.
    pub async fn execute(&self, input: GetCalendarEventsInput) -> DomainResult<Vec<CalendarEvent>> {
        let (applications, interview_rounds) = tokio::try_join!(
            self.application_repository
                .find_all_by_user_id(&input.user_id, FindApplicationsFilters::default()),
            self.interview_round_repository.find_all_by_user_id(&input.user_id),
        )?;

        let application_by_id: HashMap<&str, &Application> =
            applications.iter().map(|application| (application.id.as_str(), application)).collect();
        let mut events = Vec::new();

        for application in &applications {
            if let Some(applied_at) = application.applied_at {
                let id = format!("{}-applied", application.id);
                events.push(event(id, application, CalendarEventType::Applied, applied_at, None));
            }
            if let Some(follow_up_at) = application.follow_up_at {
                let id = format!("{}-follow-up", application.id);
                events.push(event(
                    id,
                    application,
                    CalendarEventType::FollowUp,
                    follow_up_at,
                    None,
                ));
            }
        }

        for round in interview_rounds {
            let Some(scheduled_at) = round.scheduled_at else { continue };
            let Some(application) = application_by_id.get(round.application_id.as_str()) else {
                continue;
            };
            events.push(event(
                round.id,
                application,
                CalendarEventType::Interview,
                scheduled_at,
                Some(round.r#type),
            ));
        }

        events.sort_by_key(|event| event.date);
        Ok(events)
    }
}
