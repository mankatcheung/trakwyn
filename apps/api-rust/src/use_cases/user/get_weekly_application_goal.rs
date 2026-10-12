use std::sync::Arc;

use super::weekly_application_goal::{weekly_application_goal_stats, WeeklyApplicationGoalStats};
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ApplicationRepository, FindApplicationsFilters, UserRepository};

pub struct GetWeeklyApplicationGoalUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl GetWeeklyApplicationGoalUseCase {
    pub async fn execute(&self, user_id: &str) -> DomainResult<WeeklyApplicationGoalStats> {
        let user = self
            .user_repository
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;

        let applications = self
            .application_repository
            .find_all_by_user_id(user_id, FindApplicationsFilters::default())
            .await?;
        Ok(weekly_application_goal_stats(&applications, user.weekly_application_goal, now()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::errors::ErrorCode;
    use crate::use_cases::test_support::{
        application_owned_by, user_with_email, FakeApplicationRepository, FakeUserRepository,
    };
    use crate::use_cases::user::weekly_application_goal::week_start;

    fn use_case(
        users: FakeUserRepository,
        applications: FakeApplicationRepository,
    ) -> GetWeeklyApplicationGoalUseCase {
        GetWeeklyApplicationGoalUseCase {
            user_repository: Arc::new(users),
            application_repository: Arc::new(applications),
        }
    }

    #[tokio::test]
    async fn reports_the_users_goal_and_this_weeks_count() {
        let mut this_week = application_owned_by("app-1", "user-1");
        this_week.created_at = now();
        let someone_elses = application_owned_by("app-2", "user-2");
        let use_case = use_case(
            FakeUserRepository::with(vec![user_with_email("user-1", "a@example.com")]),
            FakeApplicationRepository::with(vec![this_week, someone_elses]),
        );

        let stats = use_case.execute("user-1").await.unwrap();

        assert_eq!(stats.weekly_application_goal, 5);
        assert_eq!(stats.current_week_count, 1);
        assert_eq!(stats.current_week_start, week_start(now()));
        assert_eq!(stats.streak_weeks, 0);
    }

    #[tokio::test]
    async fn fails_when_the_user_does_not_exist() {
        let use_case =
            use_case(FakeUserRepository::default(), FakeApplicationRepository::default());

        let err = use_case.execute("missing").await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "User not found");
    }
}
