use crate::http::container::Container;
use crate::use_cases::interview_rounds::{
    CreateInterviewRoundUseCase, DeleteInterviewRoundUseCase, GetInterviewRoundAnalyticsUseCase,
    GetInterviewRoundsUseCase, UpdateInterviewRoundUseCase,
};

impl Container {
    pub fn create_interview_round_use_case(&self) -> CreateInterviewRoundUseCase {
        CreateInterviewRoundUseCase {
            application_repository: self.application_repository.clone(),
            interview_round_repository: self.interview_round_repository.clone(),
            activity_log_repository: Some(self.activity_log_repository.clone()),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn get_interview_rounds_use_case(&self) -> GetInterviewRoundsUseCase {
        GetInterviewRoundsUseCase {
            application_repository: self.application_repository.clone(),
            interview_round_repository: self.interview_round_repository.clone(),
        }
    }

    pub fn update_interview_round_use_case(&self) -> UpdateInterviewRoundUseCase {
        UpdateInterviewRoundUseCase {
            application_repository: self.application_repository.clone(),
            interview_round_repository: self.interview_round_repository.clone(),
        }
    }

    pub fn delete_interview_round_use_case(&self) -> DeleteInterviewRoundUseCase {
        DeleteInterviewRoundUseCase {
            application_repository: self.application_repository.clone(),
            interview_round_repository: self.interview_round_repository.clone(),
        }
    }

    pub fn get_interview_round_analytics_use_case(&self) -> GetInterviewRoundAnalyticsUseCase {
        GetInterviewRoundAnalyticsUseCase {
            application_repository: self.application_repository.clone(),
            interview_round_repository: self.interview_round_repository.clone(),
        }
    }
}
