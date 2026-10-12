use std::sync::{Arc, Mutex};

use super::{
    FakeActivityLogRepository, FakeApplicationRepository, FakeContactRepository,
    FakeDocumentRepository, FakeEducationRepository, FakeInterviewRoundRepository,
    FakeNoteRepository, FakeOfferRepository, FakeSkillRepository, FakeWorkExperienceRepository,
};
use crate::domain::application::Application;
use crate::use_cases::activity_logs::{GetActivityLogsUseCase, GetResponseTimeAnalyticsUseCase};
use crate::use_cases::applications::GetApplicationChannelAnalyticsUseCase;
use crate::use_cases::calendar::GetCalendarEventsUseCase;
use crate::use_cases::chat::ChatToolDeps;
use crate::use_cases::contacts::GetContactsUseCase;
use crate::use_cases::documents::GetDocumentsUseCase;
use crate::use_cases::interview_rounds::{
    GetInterviewRoundAnalyticsUseCase, GetInterviewRoundsUseCase,
};
use crate::use_cases::jobs::{GetApplicationUseCase, GetApplicationsPageUseCase};
use crate::use_cases::notes::GetNotesUseCase;
use crate::use_cases::offers::{GetOfferAnalyticsUseCase, GetOffersUseCase};
use crate::use_cases::ports::tool_call_observer::{
    ToolCallMeta, ToolCallObserver, ToolCallSettlement,
};

/// Remembers every observed call, in order.
#[derive(Default)]
pub struct RecordingToolCallObserver {
    calls: Mutex<Vec<(ToolCallMeta, ToolCallSettlement)>>,
}

impl RecordingToolCallObserver {
    pub fn calls(&self) -> Vec<(ToolCallMeta, ToolCallSettlement)> {
        self.calls.lock().unwrap().clone()
    }
}

impl ToolCallObserver for RecordingToolCallObserver {
    fn record(&self, meta: &ToolCallMeta, settlement: &ToolCallSettlement) {
        self.calls.lock().unwrap().push((meta.clone(), settlement.clone()));
    }
}

/// The read tools over empty in-memory repositories, except for these
/// `applications`.
pub fn fake_chat_tool_deps(
    applications: Vec<Application>,
    observer: Arc<dyn ToolCallObserver>,
) -> ChatToolDeps {
    let applications = Arc::new(FakeApplicationRepository::with(applications));
    let rounds = Arc::new(FakeInterviewRoundRepository::default());
    let offers = Arc::new(FakeOfferRepository::default());
    let activity = Arc::new(FakeActivityLogRepository::default());
    ChatToolDeps {
        get_applications_page_use_case: GetApplicationsPageUseCase {
            application_repository: applications.clone(),
        },
        get_application_use_case: GetApplicationUseCase {
            application_repository: applications.clone(),
        },
        get_notes_use_case: GetNotesUseCase {
            application_repository: applications.clone(),
            note_repository: Arc::new(FakeNoteRepository::default()),
        },
        get_contacts_use_case: GetContactsUseCase {
            application_repository: applications.clone(),
            contact_repository: Arc::new(FakeContactRepository::default()),
        },
        get_interview_rounds_use_case: GetInterviewRoundsUseCase {
            application_repository: applications.clone(),
            interview_round_repository: rounds.clone(),
        },
        get_documents_use_case: GetDocumentsUseCase {
            application_repository: applications.clone(),
            document_repository: Arc::new(FakeDocumentRepository::default()),
        },
        get_offers_use_case: GetOffersUseCase {
            offer_repository: offers.clone(),
            application_repository: applications.clone(),
        },
        get_activity_logs_use_case: GetActivityLogsUseCase {
            application_repository: applications.clone(),
            activity_log_repository: activity.clone(),
        },
        get_calendar_events_use_case: GetCalendarEventsUseCase {
            application_repository: applications.clone(),
            interview_round_repository: rounds.clone(),
        },
        get_response_time_analytics_use_case: GetResponseTimeAnalyticsUseCase {
            application_repository: applications.clone(),
            activity_log_repository: activity,
        },
        get_application_channel_analytics_use_case: GetApplicationChannelAnalyticsUseCase {
            application_repository: applications.clone(),
        },
        get_interview_round_analytics_use_case: GetInterviewRoundAnalyticsUseCase {
            application_repository: applications.clone(),
            interview_round_repository: rounds,
        },
        get_offer_analytics_use_case: GetOfferAnalyticsUseCase {
            offer_repository: offers,
            application_repository: applications,
        },
        work_experience_repository: Arc::new(FakeWorkExperienceRepository::default()),
        education_repository: Arc::new(FakeEducationRepository::default()),
        skill_repository: Arc::new(FakeSkillRepository::default()),
        tool_call_observer: observer,
    }
}
