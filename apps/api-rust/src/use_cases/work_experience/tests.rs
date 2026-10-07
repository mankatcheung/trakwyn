use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::*;
use crate::domain::work_experience::WorkExperience;
use crate::use_cases::client_date::ClientDate;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{sequential_ids, FakeWorkExperienceRepository};

const OWNER: &str = "user-owner";
const STRANGER: &str = "user-stranger";

fn at(seconds: i64) -> DateTime<Utc> {
    DateTime::<Utc>::from_timestamp(seconds, 0).unwrap()
}

fn experience(id: &str, user_id: &str) -> WorkExperience {
    WorkExperience {
        id: id.to_string(),
        user_id: user_id.to_string(),
        company: "Acme".to_string(),
        title: "Engineer".to_string(),
        location: Some("Remote".to_string()),
        start_date: at(100),
        end_date: Some(at(200)),
        description: Some("Built things".to_string()),
        created_at: at(0),
        updated_at: at(0),
    }
}

fn repository(seed: Vec<WorkExperience>) -> Arc<FakeWorkExperienceRepository> {
    Arc::new(FakeWorkExperienceRepository::with(seed))
}

mod create {
    use super::*;

    fn input() -> CreateWorkExperienceInput {
        CreateWorkExperienceInput {
            user_id: OWNER.to_string(),
            company: "Globex".to_string(),
            title: "Staff Engineer".to_string(),
            location: None,
            start_date: at(500).into(),
            end_date: None,
            description: None,
        }
    }

    fn use_case(repository: &Arc<FakeWorkExperienceRepository>) -> CreateWorkExperienceUseCase {
        CreateWorkExperienceUseCase {
            work_experience_repository: repository.clone(),
            generate_id: sequential_ids("id"),
        }
    }

    #[tokio::test]
    async fn stores_the_entry_with_a_generated_id_and_nulls_for_what_was_omitted() {
        let repository = repository(vec![]);

        let created = use_case(&repository).execute(input()).await.unwrap();

        assert_eq!(created.id, "id-1");
        assert_eq!(created.user_id, OWNER);
        assert_eq!(created.company, "Globex");
        assert_eq!(created.start_date, at(500));
        assert_eq!((created.location.clone(), created.end_date, created.description.clone()), (None, None, None));
        assert_eq!(repository.all(), vec![created]);
    }

    #[tokio::test]
    async fn keeps_the_optional_fields_when_given() {
        let repository = repository(vec![]);
        let input = CreateWorkExperienceInput {
            location: Some("Berlin".to_string()),
            end_date: Some(at(900).into()),
            description: Some("Led a team".to_string()),
            ..input()
        };

        let created = use_case(&repository).execute(input).await.unwrap();

        assert_eq!(created.location.as_deref(), Some("Berlin"));
        assert_eq!(created.end_date, Some(at(900)));
        assert_eq!(created.description.as_deref(), Some("Led a team"));
    }

    #[tokio::test]
    async fn an_unreadable_date_is_an_internal_error_and_stores_nothing() {
        let repository = repository(vec![]);

        for input in [
            CreateWorkExperienceInput { start_date: ClientDate::Invalid, ..input() },
            CreateWorkExperienceInput { end_date: Some(ClientDate::Invalid), ..input() },
        ] {
            let err = use_case(&repository).execute(input).await.unwrap_err();
            assert_eq!(err.code(), ErrorCode::InternalError);
        }
        assert!(repository.all().is_empty());
    }
}

mod update {
    use super::*;

    fn use_case(repository: &Arc<FakeWorkExperienceRepository>) -> UpdateWorkExperienceUseCase {
        UpdateWorkExperienceUseCase { work_experience_repository: repository.clone() }
    }

    fn input(user_id: &str, id: &str) -> UpdateWorkExperienceInput {
        UpdateWorkExperienceInput {
            id: id.to_string(),
            user_id: user_id.to_string(),
            ..UpdateWorkExperienceInput::default()
        }
    }

    #[tokio::test]
    async fn changes_only_the_fields_given() {
        let repository = repository(vec![experience("we", OWNER)]);
        let input = UpdateWorkExperienceInput {
            title: Some("Principal".to_string()),
            start_date: Some(at(150).into()),
            ..input(OWNER, "we")
        };

        let updated = use_case(&repository).execute(input).await.unwrap();

        assert_eq!(updated.title, "Principal");
        assert_eq!(updated.start_date, at(150));
        assert_eq!(updated.company, "Acme");
        assert_eq!(updated.location.as_deref(), Some("Remote"));
        assert_eq!(updated.end_date, Some(at(200)));
        assert_eq!(repository.all(), vec![updated]);
    }

    #[tokio::test]
    async fn clears_a_nullable_field_given_as_null() {
        let repository = repository(vec![experience("we", OWNER)]);
        let input = UpdateWorkExperienceInput {
            location: Some(None),
            end_date: Some(None),
            description: Some(None),
            ..input(OWNER, "we")
        };

        let updated = use_case(&repository).execute(input).await.unwrap();

        assert_eq!((updated.location, updated.end_date, updated.description), (None, None, None));
    }

    #[tokio::test]
    async fn fails_when_the_entry_does_not_exist() {
        let err =
            use_case(&repository(vec![])).execute(input(OWNER, "missing")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Work experience not found");
    }

    #[tokio::test]
    async fn someone_elses_entry_is_not_found_and_left_alone() {
        let repository = repository(vec![experience("we", OWNER)]);
        let input =
            UpdateWorkExperienceInput { title: Some("Hacked".to_string()), ..input(STRANGER, "we") };

        let err = use_case(&repository).execute(input).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(repository.all(), vec![experience("we", OWNER)]);
    }

    #[tokio::test]
    async fn an_unreadable_date_fails_after_the_ownership_check() {
        let repository = repository(vec![experience("we", OWNER)]);
        let bad_start =
            || UpdateWorkExperienceInput { start_date: Some(ClientDate::Invalid), ..input(OWNER, "we") };

        let err = use_case(&repository).execute(bad_start()).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::InternalError);

        let bad_end = UpdateWorkExperienceInput {
            end_date: Some(Some(ClientDate::Invalid)),
            ..input(OWNER, "we")
        };
        let err = use_case(&repository).execute(bad_end).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::InternalError);
        assert_eq!(repository.all(), vec![experience("we", OWNER)]);

        let missing = UpdateWorkExperienceInput { id: "missing".to_string(), ..bad_start() };
        let err = use_case(&repository).execute(missing).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
    }
}

mod delete {
    use super::*;

    fn use_case(repository: &Arc<FakeWorkExperienceRepository>) -> DeleteWorkExperienceUseCase {
        DeleteWorkExperienceUseCase { work_experience_repository: repository.clone() }
    }

    fn input(user_id: &str, id: &str) -> DeleteWorkExperienceInput {
        DeleteWorkExperienceInput { id: id.to_string(), user_id: user_id.to_string() }
    }

    #[tokio::test]
    async fn removes_the_owners_entry() {
        let repository = repository(vec![experience("we", OWNER), experience("other", OWNER)]);

        use_case(&repository).execute(input(OWNER, "we")).await.unwrap();

        assert_eq!(repository.all(), vec![experience("other", OWNER)]);
    }

    #[tokio::test]
    async fn fails_when_the_entry_does_not_exist() {
        let err =
            use_case(&repository(vec![])).execute(input(OWNER, "missing")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Work experience not found");
    }

    #[tokio::test]
    async fn someone_elses_entry_is_not_found_and_kept() {
        let repository = repository(vec![experience("we", OWNER)]);

        let err = use_case(&repository).execute(input(STRANGER, "we")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(repository.all().len(), 1);
    }
}
