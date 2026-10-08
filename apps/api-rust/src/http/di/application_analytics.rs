//! The read-only use cases over a user's applications: `apps/api`'s
//! `analytics.ts` and `activity.ts` modules, less what is not ported yet, plus
//! the weekly goal.

use crate::http::container::Container;
use crate::use_cases::activity_logs::{GetActivityLogsUseCase, GetResponseTimeAnalyticsUseCase};
use crate::use_cases::applications::{
    ComputeHealthScoreUseCase, GetApplicationChannelAnalyticsUseCase,
};
use crate::use_cases::calendar::GetCalendarEventsUseCase;
use crate::use_cases::user::GetWeeklyApplicationGoalUseCase;

impl Container {
    pub fn compute_health_score_use_case(&self) -> ComputeHealthScoreUseCase {
        ComputeHealthScoreUseCase {
            application_repository: self.application_repository.clone(),
            note_repository: self.note_repository.clone(),
            document_repository: self.document_repository.clone(),
            interview_round_repository: self.interview_round_repository.clone(),
            contact_repository: self.contact_repository.clone(),
        }
    }

    pub fn get_application_channel_analytics_use_case(
        &self,
    ) -> GetApplicationChannelAnalyticsUseCase {
        GetApplicationChannelAnalyticsUseCase {
            application_repository: self.application_repository.clone(),
        }
    }

    pub fn get_calendar_events_use_case(&self) -> GetCalendarEventsUseCase {
        GetCalendarEventsUseCase {
            application_repository: self.application_repository.clone(),
            interview_round_repository: self.interview_round_repository.clone(),
        }
    }

    pub fn get_activity_logs_use_case(&self) -> GetActivityLogsUseCase {
        GetActivityLogsUseCase {
            application_repository: self.application_repository.clone(),
            activity_log_repository: self.activity_log_repository.clone(),
        }
    }

    pub fn get_response_time_analytics_use_case(&self) -> GetResponseTimeAnalyticsUseCase {
        GetResponseTimeAnalyticsUseCase {
            application_repository: self.application_repository.clone(),
            activity_log_repository: self.activity_log_repository.clone(),
        }
    }

    pub fn get_weekly_application_goal_use_case(&self) -> GetWeeklyApplicationGoalUseCase {
        GetWeeklyApplicationGoalUseCase {
            user_repository: self.user_repository.clone(),
            application_repository: self.application_repository.clone(),
        }
    }
}
