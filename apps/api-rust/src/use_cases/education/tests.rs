use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::*;
use crate::domain::education::Education;
use crate::use_cases::client_date::ClientDate;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{sequential_ids, FakeEducationRepository};

const OWNER: &str = "user-owner";
const STRANGER: &str = "user-stranger";

fn at(seconds: i64) -> DateTime<Utc> {
    DateTime::<Utc>::from_timestamp(seconds, 0).unwrap()
}

fn education(id: &str, user_id: &str) -> Education {
    Education {
        id: id.to_string(),
        user_id: user_id.to_string(),
        institution: "MIT".to_string(),
        degree: Some("BSc".to_string()),
        field: Some("Physics".to_string()),
        start_date: at(100),
        end_date: Some(at(200)),
        description: Some("Thesis on optics".to_string()),
        created_at: at(0),
        updated_at: at(0),
    }
}

fn repository(seed: Vec<Education>) -> Arc<FakeEducationRepository> {
    Arc::new(FakeEducationRepository::with(seed))
}

mod create {
    use super::*;

    fn input() -> CreateEducationInput {
        CreateEducationInput {
            user_id: OWNER.to_string(),
            institution: "Stanford".to_string(),
            degree: None,
            field: None,
            start_date: at(500).into(),
            end_date: None,
            description: None,
        }
    }

    fn use_case(repository: &Arc<FakeEducationRepository>) -> CreateEducationUseCase {
        CreateEducationUseCase {
            education_repository: repository.clone(),
            generate_id: sequential_ids("id"),
        }
    }

    #[tokio::test]
    async fn stores_the_entry_with_a_generated_id_and_nulls_for_what_was_omitted() {
        let repository = repository(vec![]);

        let created = use_case(&repository).execute(input()).await.unwrap();

        assert_eq!(created.id, "id-1");
        assert_eq!(created.user_id, OWNER);
        assert_eq!(created.institution, "Stanford");
        assert_eq!(created.start_date, at(500));
        assert_eq!((created.degree.clone(), created.field.clone()), (None, None));
        assert_eq!((created.end_date, created.description.clone()), (None, None));
        assert_eq!(repository.all(), vec![created]);
    }

    #[tokio::test]
    async fn keeps_the_optional_fields_when_given() {
        let repository = repository(vec![]);
        let input = CreateEducationInput {
            degree: Some("MSc".to_string()),
            field: Some("CS".to_string()),
            end_date: Some(at(900).into()),
            description: Some("Honours".to_string()),
            ..input()
        };

        let created = use_case(&repository).execute(input).await.unwrap();

        assert_eq!(created.degree.as_deref(), Some("MSc"));
        assert_eq!(created.field.as_deref(), Some("CS"));
        assert_eq!(created.end_date, Some(at(900)));
        assert_eq!(created.description.as_deref(), Some("Honours"));
    }

    #[tokio::test]
    async fn an_unreadable_date_is_an_internal_error_and_stores_nothing() {
        let repository = repository(vec![]);

        for input in [
            CreateEducationInput { start_date: ClientDate::Invalid, ..input() },
            CreateEducationInput { end_date: Some(ClientDate::Invalid), ..input() },
        ] {
            let err = use_case(&repository).execute(input).await.unwrap_err();
            assert_eq!(err.code(), ErrorCode::InternalError);
        }
        assert!(repository.all().is_empty());
    }
}

mod update {
    use super::*;

    fn use_case(repository: &Arc<FakeEducationRepository>) -> UpdateEducationUseCase {
        UpdateEducationUseCase { education_repository: repository.clone() }
    }

    fn input(user_id: &str, id: &str) -> UpdateEducationInput {
        UpdateEducationInput {
            id: id.to_string(),
            user_id: user_id.to_string(),
            ..UpdateEducationInput::default()
        }
    }

    #[tokio::test]
    async fn changes_only_the_fields_given() {
        let repository = repository(vec![education("edu", OWNER)]);
        let input = UpdateEducationInput {
            institution: Some("Caltech".to_string()),
            start_date: Some(at(150).into()),
            ..input(OWNER, "edu")
        };

        let updated = use_case(&repository).execute(input).await.unwrap();

        assert_eq!(updated.institution, "Caltech");
        assert_eq!(updated.start_date, at(150));
        assert_eq!(updated.degree.as_deref(), Some("BSc"));
        assert_eq!(updated.end_date, Some(at(200)));
        assert_eq!(repository.all(), vec![updated]);
    }

    #[tokio::test]
    async fn clears_a_nullable_field_given_as_null() {
        let repository = repository(vec![education("edu", OWNER)]);
        let input = UpdateEducationInput {
            degree: Some(None),
            field: Some(None),
            end_date: Some(None),
            description: Some(None),
            ..input(OWNER, "edu")
        };

        let updated = use_case(&repository).execute(input).await.unwrap();

        assert_eq!((updated.degree, updated.field), (None, None));
        assert_eq!((updated.end_date, updated.description), (None, None));
    }

    #[tokio::test]
    async fn fails_when_the_entry_does_not_exist() {
        let err = use_case(&repository(vec![])).execute(input(OWNER, "missing")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Education not found");
    }

    #[tokio::test]
    async fn someone_elses_entry_is_not_found_and_left_alone() {
        let repository = repository(vec![education("edu", OWNER)]);
        let input = UpdateEducationInput {
            institution: Some("Hacked".to_string()),
            ..input(STRANGER, "edu")
        };

        let err = use_case(&repository).execute(input).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(repository.all(), vec![education("edu", OWNER)]);
    }

    #[tokio::test]
    async fn an_unreadable_date_fails_after_the_ownership_check() {
        let repository = repository(vec![education("edu", OWNER)]);
        let bad_start = || UpdateEducationInput {
            start_date: Some(ClientDate::Invalid),
            ..input(OWNER, "edu")
        };

        let err = use_case(&repository).execute(bad_start()).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::InternalError);

        let bad_end = UpdateEducationInput {
            end_date: Some(Some(ClientDate::Invalid)),
            ..input(OWNER, "edu")
        };
        let err = use_case(&repository).execute(bad_end).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::InternalError);
        assert_eq!(repository.all(), vec![education("edu", OWNER)]);

        let missing = UpdateEducationInput { id: "missing".to_string(), ..bad_start() };
        let err = use_case(&repository).execute(missing).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
    }
}

mod delete {
    use super::*;

    fn use_case(repository: &Arc<FakeEducationRepository>) -> DeleteEducationUseCase {
        DeleteEducationUseCase { education_repository: repository.clone() }
    }

    fn input(user_id: &str, id: &str) -> DeleteEducationInput {
        DeleteEducationInput { id: id.to_string(), user_id: user_id.to_string() }
    }

    #[tokio::test]
    async fn removes_the_owners_entry() {
        let repository = repository(vec![education("edu", OWNER), education("other", OWNER)]);

        use_case(&repository).execute(input(OWNER, "edu")).await.unwrap();

        assert_eq!(repository.all(), vec![education("other", OWNER)]);
    }

    #[tokio::test]
    async fn fails_when_the_entry_does_not_exist() {
        let err = use_case(&repository(vec![])).execute(input(OWNER, "missing")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Education not found");
    }

    #[tokio::test]
    async fn someone_elses_entry_is_not_found_and_kept() {
        let repository = repository(vec![education("edu", OWNER)]);

        let err = use_case(&repository).execute(input(STRANGER, "edu")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(repository.all().len(), 1);
    }
}
