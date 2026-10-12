use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::*;
use crate::domain::api_token::{ApiToken, ApiTokenScope};
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::secret_token;
use crate::use_cases::test_support::{sequential_ids, FakeApiTokenRepository};

const OWNER: &str = "user-owner";
const STRANGER: &str = "user-stranger";

fn token(id: &str, user_id: &str, raw: &str, scope: ApiTokenScope, created_at_s: i64) -> ApiToken {
    ApiToken {
        id: id.to_string(),
        user_id: user_id.to_string(),
        name: format!("token {id}"),
        token_hash: secret_token::hash(raw),
        scope,
        last_used_at: None,
        created_at: DateTime::<Utc>::from_timestamp(created_at_s, 0).unwrap(),
    }
}

mod create {
    use super::*;

    fn use_case(repository: &Arc<FakeApiTokenRepository>) -> CreateApiTokenUseCase {
        CreateApiTokenUseCase {
            api_token_repository: repository.clone(),
            generate_id: sequential_ids("id"),
        }
    }

    fn input(scope: Option<ApiTokenScope>) -> CreateApiTokenInput {
        CreateApiTokenInput { user_id: OWNER.to_string(), name: "CI".to_string(), scope }
    }

    #[tokio::test]
    async fn generates_a_prefixed_token_and_stores_only_its_hash() {
        let repository = Arc::new(FakeApiTokenRepository::default());

        let output = use_case(&repository).execute(input(None)).await.unwrap();

        // trakwyn_ + 24 random bytes in hex.
        let body = output.raw_token.strip_prefix("trakwyn_").unwrap();
        assert_eq!(body.len(), 48);
        assert!(body.bytes().all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f')));

        assert_eq!(output.token.id, "id-1");
        assert_eq!(output.token.user_id, OWNER);
        assert_eq!(output.token.name, "CI");
        assert_eq!(output.token.token_hash, secret_token::hash(&output.raw_token));
        assert_ne!(output.token.token_hash, output.raw_token);
        assert_eq!(repository.all(), vec![output.token]);
    }

    #[tokio::test]
    async fn defaults_to_the_full_scope_and_keeps_a_chosen_one() {
        let repository = Arc::new(FakeApiTokenRepository::default());
        let use_case = use_case(&repository);

        let defaulted = use_case.execute(input(None)).await.unwrap();
        let read = use_case.execute(input(Some(ApiTokenScope::Read))).await.unwrap();

        assert_eq!(defaulted.token.scope, ApiTokenScope::Full);
        assert_eq!(read.token.scope, ApiTokenScope::Read);
    }

    #[tokio::test]
    async fn each_call_produces_a_unique_raw_token() {
        let repository = Arc::new(FakeApiTokenRepository::default());
        let use_case = use_case(&repository);

        let first = use_case.execute(input(None)).await.unwrap();
        let second = use_case.execute(input(None)).await.unwrap();

        assert_ne!(first.raw_token, second.raw_token);
    }
}

mod list {
    use super::*;

    #[tokio::test]
    async fn returns_the_users_tokens_newest_first() {
        let repository = Arc::new(FakeApiTokenRepository::with(vec![
            token("old", OWNER, "trakwyn_a", ApiTokenScope::Full, 100),
            token("new", OWNER, "trakwyn_b", ApiTokenScope::Read, 200),
            token("foreign", STRANGER, "trakwyn_c", ApiTokenScope::Full, 300),
        ]));

        let tokens =
            ListApiTokensUseCase { api_token_repository: repository }.execute(OWNER).await.unwrap();

        let ids: Vec<&str> = tokens.iter().map(|token| token.id.as_str()).collect();
        assert_eq!(ids, vec!["new", "old"]);
    }

    #[tokio::test]
    async fn returns_nothing_when_the_user_has_no_tokens() {
        let repository = Arc::new(FakeApiTokenRepository::default());
        let tokens =
            ListApiTokensUseCase { api_token_repository: repository }.execute(OWNER).await.unwrap();
        assert!(tokens.is_empty());
    }
}

mod delete {
    use super::*;

    fn repository() -> Arc<FakeApiTokenRepository> {
        Arc::new(FakeApiTokenRepository::with(vec![token(
            "t",
            OWNER,
            "trakwyn_a",
            ApiTokenScope::Full,
            100,
        )]))
    }

    #[tokio::test]
    async fn deletes_the_token_when_it_belongs_to_the_user() {
        let repository = repository();

        DeleteApiTokenUseCase { api_token_repository: repository.clone() }
            .execute("t", OWNER)
            .await
            .unwrap();

        assert!(repository.all().is_empty());
    }

    #[tokio::test]
    async fn a_token_that_is_not_the_users_is_not_found_and_kept() {
        let repository = repository();
        let use_case = DeleteApiTokenUseCase { api_token_repository: repository.clone() };

        for (id, user_id) in [("t", STRANGER), ("missing", OWNER)] {
            let err = use_case.execute(id, user_id).await.unwrap_err();
            assert_eq!(err.code(), ErrorCode::NotFound);
            assert_eq!(err.to_string(), "API token not found");
        }
        assert_eq!(repository.all().len(), 1);
    }
}

mod validate {
    use super::*;

    const RAW: &str = "trakwyn_000102030405060708090a0b0c0d0e0f1011121314151617";

    fn repository() -> Arc<FakeApiTokenRepository> {
        Arc::new(
            FakeApiTokenRepository::with(vec![token("t", OWNER, RAW, ApiTokenScope::Read, 100)])
                .with_user(OWNER, "owner@example.com"),
        )
    }

    #[tokio::test]
    async fn returns_none_when_no_token_has_the_hash() {
        let repository = repository();

        let result = ValidateApiTokenUseCase { api_token_repository: repository.clone() }
            .execute("trakwyn_unknown")
            .await
            .unwrap();

        assert_eq!(result, None);
        assert_eq!(repository.all()[0].last_used_at, None);
    }

    #[tokio::test]
    async fn returns_the_identity_and_scope_and_records_the_use() {
        let repository = repository();

        let result = ValidateApiTokenUseCase { api_token_repository: repository.clone() }
            .execute(RAW)
            .await
            .unwrap();

        assert_eq!(
            result,
            Some(ValidateApiTokenResult {
                sub: OWNER.to_string(),
                email: "owner@example.com".to_string(),
                scope: ApiTokenScope::Read,
            })
        );
        assert!(repository.all()[0].last_used_at.is_some());
    }

    /// A row written by `apps/api` for this raw token carries this hash
    /// (printed by Node's `createHash('sha256')`), so it must be found.
    #[tokio::test]
    async fn finds_a_token_whose_hash_was_written_by_apps_api() {
        let stored = ApiToken {
            token_hash: "95dea8f28333f6549e7ab5b85a2cdf84700c4c4b67b320a846665f52f65cecfc"
                .to_string(),
            ..token("t", OWNER, "ignored", ApiTokenScope::Full, 100)
        };
        let repository = Arc::new(
            FakeApiTokenRepository::with(vec![stored]).with_user(OWNER, "owner@example.com"),
        );

        let result = ValidateApiTokenUseCase { api_token_repository: repository }
            .execute(RAW)
            .await
            .unwrap();

        assert_eq!(result.map(|result| result.sub), Some(OWNER.to_string()));
    }
}
