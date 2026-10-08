use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::*;
use crate::domain::skill::Skill;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{sequential_ids, FakeSkillRepository};

const OWNER: &str = "user-owner";
const STRANGER: &str = "user-stranger";

fn skill(id: &str, user_id: &str) -> Skill {
    Skill {
        id: id.to_string(),
        user_id: user_id.to_string(),
        name: "Rust".to_string(),
        category: Some("Languages".to_string()),
        proficiency: Some("Advanced".to_string()),
        created_at: DateTime::<Utc>::UNIX_EPOCH,
    }
}

fn repository(seed: Vec<Skill>) -> Arc<FakeSkillRepository> {
    Arc::new(FakeSkillRepository::with(seed))
}

mod create {
    use super::*;

    fn use_case(repository: &Arc<FakeSkillRepository>) -> CreateSkillUseCase {
        CreateSkillUseCase {
            skill_repository: repository.clone(),
            generate_id: sequential_ids("id"),
        }
    }

    #[tokio::test]
    async fn stores_the_skill_with_a_generated_id_and_nulls_for_what_was_omitted() {
        let repository = repository(vec![]);
        let input = CreateSkillInput {
            user_id: OWNER.to_string(),
            name: "Go".to_string(),
            category: None,
            proficiency: None,
        };

        let created = use_case(&repository).execute(input).await.unwrap();

        assert_eq!(created.id, "id-1");
        assert_eq!(created.user_id, OWNER);
        assert_eq!(created.name, "Go");
        assert_eq!((created.category.clone(), created.proficiency.clone()), (None, None));
        assert_eq!(repository.all(), vec![created]);
    }

    #[tokio::test]
    async fn keeps_the_optional_fields_when_given() {
        let repository = repository(vec![]);
        let input = CreateSkillInput {
            user_id: OWNER.to_string(),
            name: "Go".to_string(),
            category: Some("Languages".to_string()),
            proficiency: Some("Beginner".to_string()),
        };

        let created = use_case(&repository).execute(input).await.unwrap();

        assert_eq!(created.category.as_deref(), Some("Languages"));
        assert_eq!(created.proficiency.as_deref(), Some("Beginner"));
    }
}

mod update {
    use super::*;

    fn use_case(repository: &Arc<FakeSkillRepository>) -> UpdateSkillUseCase {
        UpdateSkillUseCase { skill_repository: repository.clone() }
    }

    fn input(user_id: &str, id: &str) -> UpdateSkillInput {
        UpdateSkillInput {
            id: id.to_string(),
            user_id: user_id.to_string(),
            ..UpdateSkillInput::default()
        }
    }

    #[tokio::test]
    async fn changes_only_the_fields_given() {
        let repository = repository(vec![skill("s", OWNER)]);
        let input = UpdateSkillInput { name: Some("Zig".to_string()), ..input(OWNER, "s") };

        let updated = use_case(&repository).execute(input).await.unwrap();

        assert_eq!(updated.name, "Zig");
        assert_eq!(updated.category.as_deref(), Some("Languages"));
        assert_eq!(repository.all(), vec![updated]);
    }

    #[tokio::test]
    async fn clears_a_nullable_field_given_as_null() {
        let repository = repository(vec![skill("s", OWNER)]);
        let input =
            UpdateSkillInput { category: Some(None), proficiency: Some(None), ..input(OWNER, "s") };

        let updated = use_case(&repository).execute(input).await.unwrap();

        assert_eq!((updated.category, updated.proficiency), (None, None));
    }

    #[tokio::test]
    async fn fails_when_the_skill_does_not_exist() {
        let err = use_case(&repository(vec![])).execute(input(OWNER, "missing")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Skill not found");
    }

    #[tokio::test]
    async fn someone_elses_skill_is_not_found_and_left_alone() {
        let repository = repository(vec![skill("s", OWNER)]);
        let input = UpdateSkillInput { name: Some("Hacked".to_string()), ..input(STRANGER, "s") };

        let err = use_case(&repository).execute(input).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(repository.all(), vec![skill("s", OWNER)]);
    }

    #[tokio::test]
    async fn an_update_that_sets_nothing_is_the_repositorys_internal_error() {
        let repository = repository(vec![skill("s", OWNER)]);

        let err = use_case(&repository).execute(input(OWNER, "s")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::InternalError);
    }
}

mod delete {
    use super::*;

    fn use_case(repository: &Arc<FakeSkillRepository>) -> DeleteSkillUseCase {
        DeleteSkillUseCase { skill_repository: repository.clone() }
    }

    fn input(user_id: &str, id: &str) -> DeleteSkillInput {
        DeleteSkillInput { id: id.to_string(), user_id: user_id.to_string() }
    }

    #[tokio::test]
    async fn removes_the_owners_skill() {
        let repository = repository(vec![skill("s", OWNER), skill("other", OWNER)]);

        use_case(&repository).execute(input(OWNER, "s")).await.unwrap();

        assert_eq!(repository.all(), vec![skill("other", OWNER)]);
    }

    #[tokio::test]
    async fn fails_when_the_skill_does_not_exist() {
        let err = use_case(&repository(vec![])).execute(input(OWNER, "missing")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Skill not found");
    }

    #[tokio::test]
    async fn someone_elses_skill_is_not_found_and_kept() {
        let repository = repository(vec![skill("s", OWNER)]);

        let err = use_case(&repository).execute(input(STRANGER, "s")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(repository.all().len(), 1);
    }
}
