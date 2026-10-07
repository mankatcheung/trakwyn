use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::*;
use crate::domain::conversation::Conversation;
use crate::domain::llm_api_key::LlmApiKey;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{
    sequential_ids, FakeConversationRepository, FakeLlmApiKeyRepository,
};

const OWNER: &str = "user-owner";
const STRANGER: &str = "user-stranger";

fn conversation(id: &str, user_id: &str, title: Option<&str>, updated_at_s: i64) -> Conversation {
    let updated_at = DateTime::<Utc>::from_timestamp(updated_at_s, 0).unwrap();
    Conversation {
        id: id.to_string(),
        user_id: user_id.to_string(),
        title: title.map(str::to_string),
        llm_provider: None,
        llm_model: None,
        created_at: updated_at,
        updated_at,
    }
}

fn key(user_id: &str, provider: &str) -> LlmApiKey {
    LlmApiKey {
        id: format!("key-{provider}"),
        user_id: user_id.to_string(),
        provider: provider.to_string(),
        api_key: "encrypted".to_string(),
        model: None,
        base_url: None,
        monthly_token_limit: None,
        created_at: DateTime::<Utc>::UNIX_EPOCH,
        updated_at: DateTime::<Utc>::UNIX_EPOCH,
    }
}

mod create {
    use super::*;

    struct Fixture {
        conversations: Arc<FakeConversationRepository>,
        use_case: CreateConversationUseCase,
    }

    fn fixture(keys: Vec<LlmApiKey>) -> Fixture {
        let conversations = Arc::new(FakeConversationRepository::default());
        let use_case = CreateConversationUseCase {
            conversation_repository: conversations.clone(),
            llm_api_key_repository: Arc::new(FakeLlmApiKeyRepository::with(keys)),
            generate_id: sequential_ids("id"),
        };
        Fixture { conversations, use_case }
    }

    fn input(provider: Option<&str>, model: Option<&str>) -> CreateConversationInput {
        CreateConversationInput {
            user_id: OWNER.to_string(),
            provider: provider.map(str::to_string),
            model: model.map(str::to_string),
        }
    }

    #[tokio::test]
    async fn creates_a_conversation_with_a_generated_id_and_no_locked_provider() {
        let fixture = fixture(vec![]);

        let created = fixture.use_case.execute(input(None, None)).await.unwrap();

        assert_eq!(created.id, "id-1");
        assert_eq!(created.user_id, OWNER);
        assert_eq!((created.title.clone(), created.llm_provider.clone()), (None, None));
        assert_eq!(created.llm_model, None);
        assert_eq!(fixture.conversations.all(), vec![created]);
    }

    #[tokio::test]
    async fn refuses_a_provider_the_user_has_no_key_for() {
        // Someone else's key for the provider does not count.
        let fixture = fixture(vec![key(STRANGER, "openai")]);

        let err = fixture.use_case.execute(input(Some("openai"), None)).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "Add an API key for this provider first");
        assert!(fixture.conversations.all().is_empty());
    }

    #[tokio::test]
    async fn locks_in_the_chosen_provider_and_model() {
        let fixture = fixture(vec![key(OWNER, "openai")]);

        let created =
            fixture.use_case.execute(input(Some("openai"), Some("gpt-4o-mini"))).await.unwrap();

        assert_eq!(created.llm_provider.as_deref(), Some("openai"));
        assert_eq!(created.llm_model.as_deref(), Some("gpt-4o-mini"));
    }

    #[tokio::test]
    async fn refuses_a_model_id_that_could_retarget_the_provider_url() {
        let fixture = fixture(vec![key(OWNER, "googleai")]);

        let err = fixture
            .use_case
            .execute(input(Some("googleai"), Some("../../v1/files?x=")))
            .await
            .unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "Model name contains characters that are not allowed");
        assert!(fixture.conversations.all().is_empty());
    }

    #[tokio::test]
    async fn a_model_alone_is_validated_and_stored_without_a_provider() {
        let fixture = fixture(vec![]);

        let created = fixture.use_case.execute(input(None, Some("gpt-4o"))).await.unwrap();

        assert_eq!(created.llm_provider, None);
        assert_eq!(created.llm_model.as_deref(), Some("gpt-4o"));
    }

    #[tokio::test]
    async fn empty_strings_skip_the_checks_and_are_stored_as_given() {
        let fixture = fixture(vec![]);

        let created = fixture.use_case.execute(input(Some(""), Some(""))).await.unwrap();

        assert_eq!(created.llm_provider.as_deref(), Some(""));
        assert_eq!(created.llm_model.as_deref(), Some(""));
    }
}

mod list {
    use super::*;

    fn repository() -> Arc<FakeConversationRepository> {
        Arc::new(FakeConversationRepository::with(vec![
            conversation("old", OWNER, None, 100),
            conversation("new", OWNER, None, 300),
            conversation("mid", OWNER, None, 200),
            conversation("foreign", STRANGER, None, 400),
        ]))
    }

    async fn ids(user_id: &str, limit: Option<i64>) -> Vec<String> {
        ListConversationsUseCase { conversation_repository: repository() }
            .execute(user_id, limit)
            .await
            .unwrap()
            .into_iter()
            .map(|conversation| conversation.id)
            .collect()
    }

    #[tokio::test]
    async fn returns_the_users_conversations_newest_updated_first() {
        assert_eq!(ids(OWNER, None).await, vec!["new", "mid", "old"]);
    }

    #[tokio::test]
    async fn passes_the_limit_through() {
        assert_eq!(ids(OWNER, Some(2)).await, vec!["new", "mid"]);
        assert!(ids(OWNER, Some(0)).await.is_empty());
    }

    #[tokio::test]
    async fn returns_nothing_when_the_user_has_no_conversations() {
        assert!(ids("user-nobody", None).await.is_empty());
    }
}

mod search {
    use super::*;

    fn use_case() -> SearchConversationsUseCase {
        SearchConversationsUseCase {
            conversation_repository: Arc::new(FakeConversationRepository::with(vec![
                conversation("match", OWNER, Some("Salary negotiation"), 100),
                conversation("other", OWNER, Some("Resume review"), 200),
                conversation("foreign", STRANGER, Some("Salary talk"), 300),
            ])),
        }
    }

    #[tokio::test]
    async fn searches_the_users_conversations_by_the_trimmed_term() {
        let found = use_case().execute(OWNER, "  \tsalary\u{feff}\n").await.unwrap();

        let ids: Vec<&str> = found.iter().map(|conversation| conversation.id.as_str()).collect();
        assert_eq!(ids, vec!["match"]);
    }

    #[tokio::test]
    async fn returns_nothing_for_a_blank_term_instead_of_listing_everything() {
        for term in ["", "   ", "\n\t"] {
            assert!(use_case().execute(OWNER, term).await.unwrap().is_empty());
        }
    }
}

mod delete {
    use super::*;

    fn repository() -> Arc<FakeConversationRepository> {
        Arc::new(FakeConversationRepository::with(vec![conversation("c", OWNER, None, 100)]))
    }

    fn input(user_id: &str, conversation_id: &str) -> DeleteConversationInput {
        DeleteConversationInput {
            user_id: user_id.to_string(),
            conversation_id: conversation_id.to_string(),
        }
    }

    #[tokio::test]
    async fn deletes_the_conversation_when_it_belongs_to_the_user() {
        let repository = repository();

        DeleteConversationUseCase { conversation_repository: repository.clone() }
            .execute(input(OWNER, "c"))
            .await
            .unwrap();

        assert!(repository.all().is_empty());
    }

    #[tokio::test]
    async fn fails_when_the_conversation_does_not_exist() {
        let err = DeleteConversationUseCase { conversation_repository: repository() }
            .execute(input(OWNER, "missing"))
            .await
            .unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Conversation not found");
    }

    #[tokio::test]
    async fn refuses_someone_elses_conversation() {
        let repository = repository();

        let err = DeleteConversationUseCase { conversation_repository: repository.clone() }
            .execute(input(STRANGER, "c"))
            .await
            .unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(err.to_string(), "Forbidden");
        assert_eq!(repository.all().len(), 1);
    }
}
