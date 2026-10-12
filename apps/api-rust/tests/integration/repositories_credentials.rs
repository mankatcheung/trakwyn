//! Repository tests for the credentials tables (API tokens, share links, LLM
//! keys and usage, MCP OAuth) against a real Postgres with the real
//! migrations.

use std::time::Duration;

use chrono::{DateTime, TimeDelta, Utc};
use sqlx::Row;

use trakwyn_api::domain::api_token::ApiTokenScope;
use trakwyn_api::domain::mcp_oauth::{McpOAuthCodeChallengeMethod, McpOAuthScope};
use trakwyn_api::infrastructure::db::repositories::{
    PgApiTokenRepository, PgLlmApiKeyRepository, PgLlmUsageEventRepository,
    PgMcpOAuthAuthorizationCodeRepository, PgMcpOAuthClientRepository, PgMcpOAuthGrantRepository,
    PgMcpOAuthRefreshTokenRepository, PgMcpOAuthTokenRepository, PgShareLinkRepository,
};
use trakwyn_api::infrastructure::db::Db;
use trakwyn_api::use_cases::clock::now;
use trakwyn_api::use_cases::errors::DomainError;
use trakwyn_api::use_cases::ports::{
    ApiTokenRepository, CreateApiTokenData, CreateMcpOAuthAccessTokenData,
    CreateMcpOAuthAuthorizationCodeData, CreateMcpOAuthClientData, CreateMcpOAuthRefreshTokenData,
    CreateShareLinkData, LlmApiKeyRepository, LlmUsageEventRepository,
    McpOAuthAuthorizationCodeRepository, McpOAuthClientRepository, McpOAuthGrantRepository,
    McpOAuthRefreshTokenRepository, McpOAuthTokenRepository, RecordLlmUsageEventData,
    ShareLinkRepository, UpsertLlmApiKeyData,
};

use crate::common::{seed_user, TestDb};

/// A database holding `user-1` and `user-2`.
async fn seeded() -> Db {
    let TestDb { db } = TestDb::create().await;
    seed_user(&db, "user-1").await;
    seed_user(&db, "user-2").await;
    db
}

/// Long enough that two rows written either side of it get distinct
/// millisecond timestamps.
async fn tick() {
    tokio::time::sleep(Duration::from_millis(5)).await;
}

fn hours(count: i64) -> TimeDelta {
    TimeDelta::hours(count)
}

async fn delete_user(db: &Db, id: &str) {
    sqlx::query(r#"DELETE FROM "User" WHERE "id" = $1"#).bind(id).execute(db.pool()).await.unwrap();
}

/// Rewrites one timestamp column of one row, for tests about ordering and
/// cutoffs that cannot wait for real time to pass.
async fn set_timestamp(db: &Db, table: &str, column: &str, id: &str, value: DateTime<Utc>) {
    sqlx::query(&format!(r#"UPDATE "{table}" SET "{column}" = $2 WHERE "id" = $1"#))
        .bind(id)
        .bind(value)
        .execute(db.pool())
        .await
        .unwrap();
}

mod api_tokens {
    use super::*;

    fn token_data(id: &str, user_id: &str) -> CreateApiTokenData {
        CreateApiTokenData {
            id: id.to_string(),
            user_id: user_id.to_string(),
            name: format!("name of {id}"),
            token_hash: format!("hash-{id}"),
            scope: ApiTokenScope::Full,
        }
    }

    #[tokio::test]
    async fn creates_a_token_and_reads_it_back() {
        let tokens = PgApiTokenRepository::new(seeded().await);

        let created = tokens
            .create(CreateApiTokenData { scope: ApiTokenScope::Read, ..token_data("t1", "user-1") })
            .await
            .unwrap();

        assert_eq!(created.name, "name of t1");
        assert_eq!(created.token_hash, "hash-t1");
        assert_eq!(created.scope, ApiTokenScope::Read);
        assert_eq!(created.last_used_at, None);
        // What was returned is what is stored: no sub-millisecond drift.
        assert_eq!(tokens.find_by_id("t1").await.unwrap(), Some(created));
    }

    #[tokio::test]
    async fn lists_a_users_tokens_newest_first() {
        let tokens = PgApiTokenRepository::new(seeded().await);
        tokens.create(token_data("first", "user-1")).await.unwrap();
        tick().await;
        tokens.create(token_data("second", "user-1")).await.unwrap();
        tokens.create(token_data("foreign", "user-2")).await.unwrap();

        let listed = tokens.find_all_by_user_id("user-1").await.unwrap();

        let ids: Vec<&str> = listed.iter().map(|token| token.id.as_str()).collect();
        assert_eq!(ids, vec!["second", "first"]);
    }

    #[tokio::test]
    async fn finds_a_token_by_hash_with_its_owners_email() {
        let tokens = PgApiTokenRepository::new(seeded().await);
        let created = tokens.create(token_data("t1", "user-1")).await.unwrap();

        let found = tokens.find_by_token_hash("hash-t1").await.unwrap().unwrap();

        assert_eq!(found.token, created);
        assert_eq!(found.user_email, "user-1@example.com");
    }

    #[tokio::test]
    async fn finds_nothing_for_an_unknown_hash_or_id() {
        let tokens = PgApiTokenRepository::new(seeded().await);
        tokens.create(token_data("t1", "user-1")).await.unwrap();

        assert_eq!(tokens.find_by_token_hash("nope").await.unwrap(), None);
        assert_eq!(tokens.find_by_id("nope").await.unwrap(), None);
    }

    #[tokio::test]
    async fn find_by_id_and_user_id_hides_another_users_token() {
        let tokens = PgApiTokenRepository::new(seeded().await);
        let created = tokens.create(token_data("t1", "user-1")).await.unwrap();

        assert_eq!(tokens.find_by_id_and_user_id("t1", "user-1").await.unwrap(), Some(created));
        assert_eq!(tokens.find_by_id_and_user_id("t1", "user-2").await.unwrap(), None);
    }

    #[tokio::test]
    async fn update_last_used_stamps_only_that_token() {
        let tokens = PgApiTokenRepository::new(seeded().await);
        tokens.create(token_data("t1", "user-1")).await.unwrap();
        tokens.create(token_data("t2", "user-1")).await.unwrap();
        let before = now();

        tokens.update_last_used("t1").await.unwrap();

        let used = tokens.find_by_id("t1").await.unwrap().unwrap().last_used_at.unwrap();
        assert!(used >= before);
        assert_eq!(tokens.find_by_id("t2").await.unwrap().unwrap().last_used_at, None);
    }

    #[tokio::test]
    async fn deletes_a_token() {
        let tokens = PgApiTokenRepository::new(seeded().await);
        tokens.create(token_data("t1", "user-1")).await.unwrap();
        tokens.create(token_data("t2", "user-1")).await.unwrap();

        tokens.delete("t1").await.unwrap();

        assert_eq!(tokens.find_by_id("t1").await.unwrap(), None);
        assert!(tokens.find_by_id("t2").await.unwrap().is_some());
    }

    #[tokio::test]
    async fn a_token_hash_is_unique() {
        let tokens = PgApiTokenRepository::new(seeded().await);
        tokens.create(token_data("t1", "user-1")).await.unwrap();

        let duplicate = tokens
            .create(CreateApiTokenData {
                token_hash: "hash-t1".to_string(),
                ..token_data("t2", "user-2")
            })
            .await;

        assert!(matches!(duplicate, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn a_row_written_without_a_scope_reads_as_full() {
        let db = seeded().await;
        sqlx::query(
            r#"INSERT INTO "ApiToken" ("id", "userId", "name", "tokenHash", "createdAt")
               VALUES ('t1', 'user-1', 'legacy', 'hash-t1', $1)"#,
        )
        .bind(now())
        .execute(db.pool())
        .await
        .unwrap();

        let found = PgApiTokenRepository::new(db).find_by_id("t1").await.unwrap().unwrap();

        assert_eq!(found.scope, ApiTokenScope::Full);
    }

    #[tokio::test]
    async fn a_stored_scope_this_build_does_not_know_is_an_error() {
        let db = seeded().await;
        sqlx::query(
            r#"INSERT INTO "ApiToken" ("id", "userId", "name", "tokenHash", "scope", "createdAt")
               VALUES ('t1', 'user-1', 'odd', 'hash-t1', 'admin', $1)"#,
        )
        .bind(now())
        .execute(db.pool())
        .await
        .unwrap();

        let found = PgApiTokenRepository::new(db).find_by_id("t1").await;

        assert!(matches!(found, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn deleting_the_user_cascades_to_their_tokens() {
        let db = seeded().await;
        let tokens = PgApiTokenRepository::new(db.clone());
        tokens.create(token_data("t1", "user-1")).await.unwrap();

        delete_user(&db, "user-1").await;

        assert_eq!(tokens.find_by_id("t1").await.unwrap(), None);
    }
}

mod share_links {
    use super::*;

    fn link_data(id: &str, user_id: &str) -> CreateShareLinkData {
        CreateShareLinkData {
            id: id.to_string(),
            user_id: user_id.to_string(),
            name: format!("name of {id}"),
            token_hash: format!("hash-{id}"),
        }
    }

    #[tokio::test]
    async fn creates_a_link_and_finds_it_by_hash() {
        let links = PgShareLinkRepository::new(seeded().await);

        let created = links.create(link_data("l1", "user-1")).await.unwrap();

        assert_eq!(created.name, "name of l1");
        assert_eq!(created.last_used_at, None);
        assert_eq!(links.find_by_token_hash("hash-l1").await.unwrap(), Some(created));
        assert_eq!(links.find_by_token_hash("nope").await.unwrap(), None);
    }

    #[tokio::test]
    async fn lists_a_users_links_newest_first() {
        let links = PgShareLinkRepository::new(seeded().await);
        links.create(link_data("first", "user-1")).await.unwrap();
        tick().await;
        links.create(link_data("second", "user-1")).await.unwrap();
        links.create(link_data("foreign", "user-2")).await.unwrap();

        let listed = links.find_all_by_user_id("user-1").await.unwrap();

        let ids: Vec<&str> = listed.iter().map(|link| link.id.as_str()).collect();
        assert_eq!(ids, vec!["second", "first"]);
    }

    #[tokio::test]
    async fn find_by_id_and_user_id_hides_another_users_link() {
        let links = PgShareLinkRepository::new(seeded().await);
        let created = links.create(link_data("l1", "user-1")).await.unwrap();

        assert_eq!(links.find_by_id_and_user_id("l1", "user-1").await.unwrap(), Some(created));
        assert_eq!(links.find_by_id_and_user_id("l1", "user-2").await.unwrap(), None);
        assert_eq!(links.find_by_id_and_user_id("nope", "user-1").await.unwrap(), None);
    }

    #[tokio::test]
    async fn update_last_used_stamps_only_that_link() {
        let links = PgShareLinkRepository::new(seeded().await);
        links.create(link_data("l1", "user-1")).await.unwrap();
        links.create(link_data("l2", "user-1")).await.unwrap();
        let before = now();

        links.update_last_used("l1").await.unwrap();

        let used = links.find_by_token_hash("hash-l1").await.unwrap().unwrap().last_used_at;
        assert!(used.unwrap() >= before);
        assert_eq!(links.find_by_token_hash("hash-l2").await.unwrap().unwrap().last_used_at, None);
    }

    #[tokio::test]
    async fn deletes_a_link() {
        let links = PgShareLinkRepository::new(seeded().await);
        links.create(link_data("l1", "user-1")).await.unwrap();
        links.create(link_data("l2", "user-1")).await.unwrap();

        links.delete("l1").await.unwrap();

        let remaining = links.find_all_by_user_id("user-1").await.unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, "l2");
    }

    #[tokio::test]
    async fn a_token_hash_is_unique() {
        let links = PgShareLinkRepository::new(seeded().await);
        links.create(link_data("l1", "user-1")).await.unwrap();

        let duplicate = links
            .create(CreateShareLinkData {
                token_hash: "hash-l1".to_string(),
                ..link_data("l2", "user-2")
            })
            .await;

        assert!(matches!(duplicate, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn deleting_the_user_cascades_to_their_links() {
        let db = seeded().await;
        let links = PgShareLinkRepository::new(db.clone());
        links.create(link_data("l1", "user-1")).await.unwrap();

        delete_user(&db, "user-1").await;

        assert_eq!(links.find_by_token_hash("hash-l1").await.unwrap(), None);
    }
}

mod llm_api_keys {
    use super::*;

    fn key_data(id: &str, user_id: &str, provider: &str) -> UpsertLlmApiKeyData {
        UpsertLlmApiKeyData {
            id: id.to_string(),
            user_id: user_id.to_string(),
            provider: provider.to_string(),
            api_key: format!("ciphertext-{id}"),
            model: None,
            base_url: None,
        }
    }

    #[tokio::test]
    async fn upsert_inserts_when_the_user_has_no_key_for_the_provider() {
        let keys = PgLlmApiKeyRepository::new(seeded().await);

        let created = keys
            .upsert(UpsertLlmApiKeyData {
                model: Some("gpt-4o".to_string()),
                base_url: Some("https://llm.example.com/v1".to_string()),
                ..key_data("k1", "user-1", "custom")
            })
            .await
            .unwrap();

        assert_eq!(created.id, "k1");
        assert_eq!(created.api_key, "ciphertext-k1");
        assert_eq!(created.model.as_deref(), Some("gpt-4o"));
        assert_eq!(created.base_url.as_deref(), Some("https://llm.example.com/v1"));
        assert_eq!(created.monthly_token_limit, None);
        assert_eq!(created.created_at, created.updated_at);
        assert_eq!(
            keys.find_by_user_id_and_provider("user-1", "custom").await.unwrap(),
            Some(created)
        );
    }

    #[tokio::test]
    async fn upsert_replaces_the_existing_key_instead_of_duplicating_it() {
        let keys = PgLlmApiKeyRepository::new(seeded().await);
        let original = keys
            .upsert(UpsertLlmApiKeyData {
                model: Some("gpt-4o".to_string()),
                ..key_data("k1", "user-1", "openai")
            })
            .await
            .unwrap();
        tick().await;

        let replaced = keys.upsert(key_data("k2", "user-1", "openai")).await.unwrap();

        // The row keeps its identity; the new id is not used.
        assert_eq!(replaced.id, "k1");
        assert_eq!(replaced.api_key, "ciphertext-k2");
        // A null in the new data overwrites what was there.
        assert_eq!(replaced.model, None);
        assert_eq!(replaced.created_at, original.created_at);
        assert!(replaced.updated_at > original.updated_at);
        assert_eq!(keys.find_all_by_user_id("user-1").await.unwrap(), vec![replaced]);
    }

    #[tokio::test]
    async fn keeps_one_key_per_provider_and_per_user() {
        let keys = PgLlmApiKeyRepository::new(seeded().await);
        keys.upsert(key_data("k1", "user-1", "openai")).await.unwrap();
        keys.upsert(key_data("k2", "user-1", "anthropic")).await.unwrap();
        keys.upsert(key_data("k3", "user-2", "openai")).await.unwrap();

        let mut ids: Vec<String> = keys
            .find_all_by_user_id("user-1")
            .await
            .unwrap()
            .into_iter()
            .map(|key| key.id)
            .collect();
        ids.sort();

        assert_eq!(ids, vec!["k1", "k2"]);
        assert_eq!(
            keys.find_by_user_id_and_provider("user-2", "openai").await.unwrap().unwrap().id,
            "k3"
        );
        assert_eq!(keys.find_by_user_id_and_provider("user-2", "anthropic").await.unwrap(), None);
    }

    #[tokio::test]
    async fn the_database_refuses_a_second_row_for_one_user_and_provider() {
        let db = seeded().await;
        PgLlmApiKeyRepository::new(db.clone())
            .upsert(key_data("k1", "user-1", "openai"))
            .await
            .unwrap();

        let duplicate = sqlx::query(
            r#"INSERT INTO "LlmApiKey" ("id", "userId", "provider", "apiKey", "createdAt", "updatedAt")
               VALUES ('k2', 'user-1', 'openai', 'x', $1, $1)"#,
        )
        .bind(now())
        .execute(db.pool())
        .await;

        assert!(duplicate.is_err());
    }

    #[tokio::test]
    async fn deletes_only_that_users_key_for_that_provider() {
        let keys = PgLlmApiKeyRepository::new(seeded().await);
        keys.upsert(key_data("k1", "user-1", "openai")).await.unwrap();
        keys.upsert(key_data("k2", "user-1", "anthropic")).await.unwrap();
        keys.upsert(key_data("k3", "user-2", "openai")).await.unwrap();

        keys.delete("user-1", "openai").await.unwrap();

        assert_eq!(keys.find_by_user_id_and_provider("user-1", "openai").await.unwrap(), None);
        assert!(keys.find_by_user_id_and_provider("user-1", "anthropic").await.unwrap().is_some());
        assert!(keys.find_by_user_id_and_provider("user-2", "openai").await.unwrap().is_some());
    }

    #[tokio::test]
    async fn sets_a_monthly_limit_beyond_32_bits_and_reads_it_back() {
        let keys = PgLlmApiKeyRepository::new(seeded().await);
        let created = keys.upsert(key_data("k1", "user-1", "openai")).await.unwrap();
        tick().await;

        let limited = keys
            .set_monthly_token_limit("user-1", "openai", Some(5_000_000_000))
            .await
            .unwrap()
            .unwrap();

        assert_eq!(limited.monthly_token_limit, Some(5_000_000_000));
        assert!(limited.updated_at > created.updated_at);
        assert_eq!(
            keys.find_by_user_id_and_provider("user-1", "openai").await.unwrap(),
            Some(limited)
        );
    }

    #[tokio::test]
    async fn clears_a_monthly_limit_with_none() {
        let keys = PgLlmApiKeyRepository::new(seeded().await);
        keys.upsert(key_data("k1", "user-1", "openai")).await.unwrap();
        keys.set_monthly_token_limit("user-1", "openai", Some(1000)).await.unwrap();

        let cleared = keys.set_monthly_token_limit("user-1", "openai", None).await.unwrap();

        assert_eq!(cleared.unwrap().monthly_token_limit, None);
    }

    #[tokio::test]
    async fn setting_a_limit_on_a_provider_with_no_key_returns_none() {
        let keys = PgLlmApiKeyRepository::new(seeded().await);
        keys.upsert(key_data("k1", "user-1", "openai")).await.unwrap();

        assert_eq!(
            keys.set_monthly_token_limit("user-1", "anthropic", Some(1)).await.unwrap(),
            None
        );
        assert_eq!(keys.set_monthly_token_limit("user-2", "openai", Some(1)).await.unwrap(), None);
    }

    #[tokio::test]
    async fn re_saving_the_key_keeps_its_limit() {
        let keys = PgLlmApiKeyRepository::new(seeded().await);
        keys.upsert(key_data("k1", "user-1", "openai")).await.unwrap();
        keys.set_monthly_token_limit("user-1", "openai", Some(250_000)).await.unwrap();

        let resaved = keys.upsert(key_data("k2", "user-1", "openai")).await.unwrap();

        assert_eq!(resaved.api_key, "ciphertext-k2");
        assert_eq!(resaved.monthly_token_limit, Some(250_000));
    }

    #[tokio::test]
    async fn deleting_the_user_cascades_to_their_keys() {
        let db = seeded().await;
        let keys = PgLlmApiKeyRepository::new(db.clone());
        keys.upsert(key_data("k1", "user-1", "openai")).await.unwrap();

        delete_user(&db, "user-1").await;

        assert_eq!(keys.find_all_by_user_id("user-1").await.unwrap(), vec![]);
    }
}

mod llm_usage_events {
    use super::*;

    fn event(id: &str, provider: &str, prompt: i32, completion: i32) -> RecordLlmUsageEventData {
        RecordLlmUsageEventData {
            id: id.to_string(),
            user_id: "user-1".to_string(),
            provider: provider.to_string(),
            model: None,
            prompt_tokens: prompt,
            completion_tokens: completion,
            ..RecordLlmUsageEventData::default()
        }
    }

    fn epoch() -> DateTime<Utc> {
        DateTime::<Utc>::UNIX_EPOCH
    }

    #[tokio::test]
    async fn records_an_event_and_summarizes_it() {
        let events = PgLlmUsageEventRepository::new(seeded().await);
        let before = now();

        events
            .record(RecordLlmUsageEventData {
                model: Some("gpt-4o-mini".to_string()),
                ..event("evt-1", "openrouter", 100, 20)
            })
            .await
            .unwrap();

        let summary = events.summarize_by_user_id("user-1", epoch()).await.unwrap();
        assert_eq!(summary.len(), 1);
        assert_eq!(summary[0].provider, "openrouter");
        assert_eq!(summary[0].request_count, 1);
        assert_eq!(summary[0].prompt_tokens, 100);
        assert_eq!(summary[0].completion_tokens, 20);
        // No split reported: the sums coalesce to zero rather than null.
        assert_eq!(summary[0].cache_read_tokens, 0);
        assert_eq!(summary[0].cache_write_tokens, 0);
        assert!(summary[0].last_used_at >= before);
    }

    #[tokio::test]
    async fn stores_every_column_it_is_given() {
        let db = seeded().await;
        let events = PgLlmUsageEventRepository::new(db.clone());

        events.record(event("evt-exact", "openai", 10, 1)).await.unwrap();
        events
            .record(RecordLlmUsageEventData {
                model: Some("gpt-4o".to_string()),
                cache_read_tokens: Some(7),
                cache_write_tokens: Some(3),
                estimated: true,
                ..event("evt-est", "openai", 20, 0)
            })
            .await
            .unwrap();

        let rows = sqlx::query(r#"SELECT * FROM "LlmUsageEvent" ORDER BY "id""#)
            .fetch_all(db.pool())
            .await
            .unwrap();
        let (estimated, exact) = (&rows[0], &rows[1]);
        assert!(estimated.get::<bool, _>("estimated"));
        assert_eq!(estimated.get::<Option<String>, _>("model").as_deref(), Some("gpt-4o"));
        assert_eq!(estimated.get::<Option<i32>, _>("cacheReadTokens"), Some(7));
        assert_eq!(estimated.get::<Option<i32>, _>("cacheWriteTokens"), Some(3));
        assert!(!exact.get::<bool, _>("estimated"));
        assert_eq!(exact.get::<Option<String>, _>("model"), None);
        assert_eq!(exact.get::<Option<i32>, _>("cacheReadTokens"), None);
        assert_eq!(exact.get::<Option<i32>, _>("cacheWriteTokens"), None);

        // Estimates count toward the month like any other event.
        let summary = events.summarize_by_user_id("user-1", epoch()).await.unwrap();
        assert_eq!(summary[0].prompt_tokens, 30);
    }

    #[tokio::test]
    async fn sums_the_cache_split_over_the_events_that_report_one() {
        let events = PgLlmUsageEventRepository::new(seeded().await);
        events
            .record(RecordLlmUsageEventData {
                cache_read_tokens: Some(800),
                cache_write_tokens: Some(100),
                ..event("evt-1", "anthropic", 1000, 20)
            })
            .await
            .unwrap();
        events
            .record(RecordLlmUsageEventData {
                cache_read_tokens: Some(900),
                cache_write_tokens: None,
                ..event("evt-2", "anthropic", 1000, 20)
            })
            .await
            .unwrap();

        let summary = events.summarize_by_user_id("user-1", epoch()).await.unwrap();

        assert_eq!(summary[0].prompt_tokens, 2000);
        assert_eq!(summary[0].cache_read_tokens, 1700);
        assert_eq!(summary[0].cache_write_tokens, 100);
    }

    #[tokio::test]
    async fn sums_per_provider_across_every_model() {
        let events = PgLlmUsageEventRepository::new(seeded().await);
        for (id, model, prompt, completion) in
            [("evt-1", "gpt-4o-mini", 100, 20), ("evt-2", "gpt-4o", 50, 10), ("evt-3", "o3", 1, 2)]
        {
            events
                .record(RecordLlmUsageEventData {
                    model: Some(model.to_string()),
                    ..event(id, "openrouter", prompt, completion)
                })
                .await
                .unwrap();
        }

        let summary = events.summarize_by_user_id("user-1", epoch()).await.unwrap();

        assert_eq!(summary.len(), 1);
        assert_eq!(summary[0].request_count, 3);
        assert_eq!(summary[0].prompt_tokens, 151);
        assert_eq!(summary[0].completion_tokens, 32);
    }

    #[tokio::test]
    async fn totals_past_32_bits_do_not_overflow() {
        let events = PgLlmUsageEventRepository::new(seeded().await);
        for id in ["evt-1", "evt-2", "evt-3"] {
            events.record(event(id, "openai", i32::MAX, i32::MAX)).await.unwrap();
        }

        let summary = events.summarize_by_user_id("user-1", epoch()).await.unwrap();

        assert_eq!(summary[0].prompt_tokens, 3 * i64::from(i32::MAX));
        assert_eq!(summary[0].completion_tokens, 3 * i64::from(i32::MAX));
    }

    #[tokio::test]
    async fn lists_providers_most_recently_used_first() {
        let db = seeded().await;
        let events = PgLlmUsageEventRepository::new(db.clone());
        events.record(event("old-openai", "openai", 1, 1)).await.unwrap();
        events.record(event("anthropic", "anthropic", 1, 1)).await.unwrap();
        events.record(event("new-openai", "openai", 1, 1)).await.unwrap();
        events.record(event("gemini", "gemini", 1, 1)).await.unwrap();
        let base = now();
        for (id, age) in [("old-openai", 4), ("anthropic", 2), ("new-openai", 1), ("gemini", 3)] {
            set_timestamp(&db, "LlmUsageEvent", "createdAt", id, base - hours(age)).await;
        }

        let summary = events.summarize_by_user_id("user-1", epoch()).await.unwrap();

        let providers: Vec<&str> = summary.iter().map(|row| row.provider.as_str()).collect();
        assert_eq!(providers, vec!["openai", "anthropic", "gemini"]);
        // A provider's last use is its newest event, not its oldest.
        assert_eq!(summary[0].last_used_at, base - hours(1));
        assert_eq!(summary[0].request_count, 2);
    }

    #[tokio::test]
    async fn leaves_out_another_users_events() {
        let events = PgLlmUsageEventRepository::new(seeded().await);
        events.record(event("mine", "openai", 10, 1)).await.unwrap();
        events
            .record(RecordLlmUsageEventData {
                user_id: "user-2".to_string(),
                ..event("theirs", "openai", 999, 999)
            })
            .await
            .unwrap();

        let summary = events.summarize_by_user_id("user-1", epoch()).await.unwrap();

        assert_eq!(summary.len(), 1);
        assert_eq!(summary[0].prompt_tokens, 10);
    }

    #[tokio::test]
    async fn summarizes_to_nothing_when_nothing_was_recorded() {
        let events = PgLlmUsageEventRepository::new(seeded().await);
        assert_eq!(events.summarize_by_user_id("user-1", epoch()).await.unwrap(), vec![]);
    }

    #[tokio::test]
    async fn counts_only_events_at_or_after_the_cutoff() {
        let db = seeded().await;
        let events = PgLlmUsageEventRepository::new(db.clone());
        let since = now() - hours(24);
        events.record(event("before", "openai", 1000, 100)).await.unwrap();
        events.record(event("boundary", "openai", 20, 2)).await.unwrap();
        events.record(event("after", "openai", 3, 1)).await.unwrap();
        events.record(event("stale-provider", "anthropic", 5, 5)).await.unwrap();
        set_timestamp(&db, "LlmUsageEvent", "createdAt", "before", since - hours(1)).await;
        set_timestamp(&db, "LlmUsageEvent", "createdAt", "boundary", since).await;
        set_timestamp(&db, "LlmUsageEvent", "createdAt", "stale-provider", since - hours(1)).await;

        let summary = events.summarize_by_user_id("user-1", since).await.unwrap();

        // The older event is excluded, not deleted; a provider with nothing
        // since the cutoff has no row at all.
        assert_eq!(summary.len(), 1);
        assert_eq!(summary[0].request_count, 2);
        assert_eq!(summary[0].prompt_tokens, 23);
        assert_eq!(summary[0].completion_tokens, 3);
    }

    #[tokio::test]
    async fn an_event_id_is_unique() {
        let events = PgLlmUsageEventRepository::new(seeded().await);
        events.record(event("evt-1", "openai", 1, 1)).await.unwrap();

        let duplicate = events.record(event("evt-1", "anthropic", 1, 1)).await;

        assert!(matches!(duplicate, Err(DomainError::Internal(_))));
    }
}

mod mcp_oauth {
    use super::*;

    const REDIRECT_URI: &str = "https://client.example.com/callback";

    async fn seed_client(db: &Db, id: &str, name: &str) {
        PgMcpOAuthClientRepository::new(db.clone())
            .create(CreateMcpOAuthClientData {
                id: id.to_string(),
                name: name.to_string(),
                redirect_uris: vec![REDIRECT_URI.to_string()],
            })
            .await
            .unwrap();
    }

    /// `user-1`, `user-2` and the client `client-1`.
    async fn seeded_with_client() -> Db {
        let db = seeded().await;
        seed_client(&db, "client-1", "Claude").await;
        db
    }

    fn code_data(id: &str, family_id: &str) -> CreateMcpOAuthAuthorizationCodeData {
        CreateMcpOAuthAuthorizationCodeData {
            id: id.to_string(),
            code_hash: format!("code-hash-{id}"),
            family_id: family_id.to_string(),
            client_id: "client-1".to_string(),
            user_id: "user-1".to_string(),
            redirect_uri: REDIRECT_URI.to_string(),
            scope: McpOAuthScope::Read,
            code_challenge: "challenge".to_string(),
            code_challenge_method: McpOAuthCodeChallengeMethod::S256,
            expires_at: now() + hours(1),
        }
    }

    fn refresh_data(id: &str, family_id: &str) -> CreateMcpOAuthRefreshTokenData {
        CreateMcpOAuthRefreshTokenData {
            id: id.to_string(),
            token_hash: format!("refresh-hash-{id}"),
            family_id: family_id.to_string(),
            client_id: "client-1".to_string(),
            user_id: "user-1".to_string(),
            scope: McpOAuthScope::Read,
            expires_at: now() + hours(24),
        }
    }

    fn access_data(id: &str, family_id: &str) -> CreateMcpOAuthAccessTokenData {
        CreateMcpOAuthAccessTokenData {
            id: id.to_string(),
            user_id: "user-1".to_string(),
            client_id: "client-1".to_string(),
            family_id: family_id.to_string(),
            token_hash: format!("access-hash-{id}"),
            scope: McpOAuthScope::Read,
            audience: "https://api.example.com/mcp".to_string(),
            expires_at: now() + hours(1),
        }
    }

    mod clients {
        use super::*;

        #[tokio::test]
        async fn creates_a_client_and_reads_it_back() {
            let db = seeded().await;
            let clients = PgMcpOAuthClientRepository::new(db.clone());

            let created = clients
                .create(CreateMcpOAuthClientData {
                    id: "client-1".to_string(),
                    name: "Claude".to_string(),
                    redirect_uris: vec![
                        REDIRECT_URI.to_string(),
                        "http://127.0.0.1:8123/cb?a=\"quoted\"".to_string(),
                    ],
                })
                .await
                .unwrap();

            assert_eq!(created.name, "Claude");
            assert_eq!(created.redirect_uris.len(), 2);
            assert_eq!(created.redirect_uris[1], "http://127.0.0.1:8123/cb?a=\"quoted\"");
            assert_eq!(created.revoked_at, None);
            assert_eq!(clients.find_by_id("client-1").await.unwrap(), Some(created));
            assert_eq!(clients.find_by_id("nope").await.unwrap(), None);
        }

        #[tokio::test]
        async fn stores_the_redirect_uris_as_a_json_array_in_text() {
            let db = seeded().await;
            seed_client(&db, "client-1", "Claude").await;

            let stored: String =
                sqlx::query_scalar(r#"SELECT "redirectUris" FROM "McpOAuthClient""#)
                    .fetch_one(db.pool())
                    .await
                    .unwrap();

            // Byte for byte what `JSON.stringify` writes, so either
            // implementation reads the other's rows.
            assert_eq!(stored, r#"["https://client.example.com/callback"]"#);
        }

        #[tokio::test]
        async fn redirect_uris_that_are_not_a_string_array_read_as_none() {
            let db = seeded().await;
            for (id, stored) in [
                ("not-json", "not json at all"),
                ("not-array", r#"{"uri":"https://x.example.com"}"#),
                ("not-strings", r#"["https://x.example.com", 7]"#),
            ] {
                sqlx::query(
                    r#"INSERT INTO "McpOAuthClient" ("id", "name", "redirectUris", "createdAt")
                       VALUES ($1, 'odd', $2, $3)"#,
                )
                .bind(id)
                .bind(stored)
                .bind(now())
                .execute(db.pool())
                .await
                .unwrap();
            }
            let clients = PgMcpOAuthClientRepository::new(db);

            for id in ["not-json", "not-array", "not-strings"] {
                let client = clients.find_by_id(id).await.unwrap().unwrap();
                assert_eq!(client.redirect_uris, Vec::<String>::new(), "{id}");
            }
        }

        #[tokio::test]
        async fn reads_back_a_revocation() {
            let db = seeded_with_client().await;
            let revoked_at = now();
            set_timestamp(&db, "McpOAuthClient", "revokedAt", "client-1", revoked_at).await;

            let client =
                PgMcpOAuthClientRepository::new(db).find_by_id("client-1").await.unwrap().unwrap();

            assert_eq!(client.revoked_at, Some(revoked_at));
        }
    }

    mod authorization_codes {
        use super::*;

        #[tokio::test]
        async fn creates_a_code_and_finds_it_by_hash() {
            let codes = PgMcpOAuthAuthorizationCodeRepository::new(seeded_with_client().await);
            let data = CreateMcpOAuthAuthorizationCodeData {
                scope: McpOAuthScope::Full,
                ..code_data("code-1", "family-1")
            };

            let created = codes.create(data.clone()).await.unwrap();

            assert_eq!(created.family_id, "family-1");
            assert_eq!(created.client_id, "client-1");
            assert_eq!(created.user_id, "user-1");
            assert_eq!(created.redirect_uri, REDIRECT_URI);
            assert_eq!(created.scope, McpOAuthScope::Full);
            assert_eq!(created.code_challenge, "challenge");
            assert_eq!(created.code_challenge_method, McpOAuthCodeChallengeMethod::S256);
            assert_eq!(created.expires_at, data.expires_at);
            assert_eq!(created.consumed_at, None);
            assert_eq!(codes.find_by_code_hash("code-hash-code-1").await.unwrap(), Some(created));
            assert_eq!(codes.find_by_code_hash("nope").await.unwrap(), None);
        }

        #[tokio::test]
        async fn a_code_is_consumed_exactly_once() {
            let codes = PgMcpOAuthAuthorizationCodeRepository::new(seeded_with_client().await);
            codes.create(code_data("code-1", "family-1")).await.unwrap();
            let first = now();

            assert!(codes.consume("code-1", first).await.unwrap());
            assert!(!codes.consume("code-1", first + hours(1)).await.unwrap());

            // The replay did not move the original consumption time.
            let stored = codes.find_by_code_hash("code-hash-code-1").await.unwrap().unwrap();
            assert_eq!(stored.consumed_at, Some(first));
        }

        #[tokio::test]
        async fn consuming_an_unknown_code_reports_nothing_consumed() {
            let codes = PgMcpOAuthAuthorizationCodeRepository::new(seeded_with_client().await);
            assert!(!codes.consume("nope", now()).await.unwrap());
        }

        #[tokio::test]
        async fn a_code_hash_is_unique() {
            let codes = PgMcpOAuthAuthorizationCodeRepository::new(seeded_with_client().await);
            codes.create(code_data("code-1", "family-1")).await.unwrap();

            let duplicate = codes
                .create(CreateMcpOAuthAuthorizationCodeData {
                    code_hash: "code-hash-code-1".to_string(),
                    ..code_data("code-2", "family-2")
                })
                .await;

            assert!(matches!(duplicate, Err(DomainError::Internal(_))));
        }

        #[tokio::test]
        async fn a_code_needs_a_registered_client() {
            let codes = PgMcpOAuthAuthorizationCodeRepository::new(seeded_with_client().await);

            let orphan = codes
                .create(CreateMcpOAuthAuthorizationCodeData {
                    client_id: "unregistered".to_string(),
                    ..code_data("code-1", "family-1")
                })
                .await;

            assert!(matches!(orphan, Err(DomainError::Internal(_))));
        }

        #[tokio::test]
        async fn deleting_the_client_or_the_user_cascades_to_the_code() {
            let db = seeded_with_client().await;
            seed_client(&db, "client-2", "Other").await;
            let codes = PgMcpOAuthAuthorizationCodeRepository::new(db.clone());
            codes.create(code_data("by-client", "family-1")).await.unwrap();
            codes
                .create(CreateMcpOAuthAuthorizationCodeData {
                    client_id: "client-2".to_string(),
                    user_id: "user-2".to_string(),
                    ..code_data("by-user", "family-2")
                })
                .await
                .unwrap();

            sqlx::query(r#"DELETE FROM "McpOAuthClient" WHERE "id" = 'client-1'"#)
                .execute(db.pool())
                .await
                .unwrap();
            delete_user(&db, "user-2").await;

            assert_eq!(codes.find_by_code_hash("code-hash-by-client").await.unwrap(), None);
            assert_eq!(codes.find_by_code_hash("code-hash-by-user").await.unwrap(), None);
        }

        #[tokio::test]
        async fn a_stored_challenge_method_this_build_does_not_know_is_an_error() {
            let db = seeded_with_client().await;
            let codes = PgMcpOAuthAuthorizationCodeRepository::new(db.clone());
            codes.create(code_data("code-1", "family-1")).await.unwrap();
            sqlx::query(
                r#"UPDATE "McpOAuthAuthorizationCode" SET "codeChallengeMethod" = 'plain'"#,
            )
            .execute(db.pool())
            .await
            .unwrap();

            let found = codes.find_by_code_hash("code-hash-code-1").await;

            assert!(matches!(found, Err(DomainError::Internal(_))));
        }
    }

    mod refresh_tokens {
        use super::*;

        #[tokio::test]
        async fn creates_a_token_and_finds_it_by_hash() {
            let tokens = PgMcpOAuthRefreshTokenRepository::new(seeded().await);
            let data = CreateMcpOAuthRefreshTokenData {
                scope: McpOAuthScope::Full,
                ..refresh_data("r1", "family-1")
            };

            let created = tokens.create(data.clone()).await.unwrap();

            assert_eq!(created.family_id, "family-1");
            assert_eq!(created.client_id, "client-1");
            assert_eq!(created.user_id, "user-1");
            assert_eq!(created.scope, McpOAuthScope::Full);
            assert_eq!(created.expires_at, data.expires_at);
            assert_eq!(created.used_at, None);
            assert_eq!(created.revoked_at, None);
            assert_eq!(tokens.find_by_token_hash("refresh-hash-r1").await.unwrap(), Some(created));
            assert_eq!(tokens.find_by_token_hash("nope").await.unwrap(), None);
        }

        #[tokio::test]
        async fn a_token_is_marked_used_exactly_once() {
            let tokens = PgMcpOAuthRefreshTokenRepository::new(seeded().await);
            tokens.create(refresh_data("r1", "family-1")).await.unwrap();
            let first = now();

            assert!(tokens.mark_used("r1", first).await.unwrap());
            assert!(!tokens.mark_used("r1", first + hours(1)).await.unwrap());
            assert!(!tokens.mark_used("nope", first).await.unwrap());

            let stored = tokens.find_by_token_hash("refresh-hash-r1").await.unwrap().unwrap();
            assert_eq!(stored.used_at, Some(first));
        }

        #[tokio::test]
        async fn revoking_a_family_spares_other_families_and_earlier_revocations() {
            let db = seeded().await;
            let tokens = PgMcpOAuthRefreshTokenRepository::new(db.clone());
            for (id, family) in [("live-1", "family-1"), ("live-2", "family-1")] {
                tokens.create(refresh_data(id, family)).await.unwrap();
            }
            tokens.create(refresh_data("earlier", "family-1")).await.unwrap();
            tokens.create(refresh_data("other", "family-2")).await.unwrap();
            let earlier = now() - hours(2);
            set_timestamp(&db, "McpOAuthRefreshToken", "revokedAt", "earlier", earlier).await;
            let revoked_at = now();

            tokens.revoke_family("family-1", revoked_at).await.unwrap();

            let revoked_of = |id: &'static str| {
                let tokens = &tokens;
                async move {
                    let hash = format!("refresh-hash-{id}");
                    tokens.find_by_token_hash(&hash).await.unwrap().unwrap().revoked_at
                }
            };
            assert_eq!(revoked_of("live-1").await, Some(revoked_at));
            assert_eq!(revoked_of("live-2").await, Some(revoked_at));
            assert_eq!(revoked_of("earlier").await, Some(earlier));
            assert_eq!(revoked_of("other").await, None);
        }

        #[tokio::test]
        async fn a_token_hash_is_unique() {
            let tokens = PgMcpOAuthRefreshTokenRepository::new(seeded().await);
            tokens.create(refresh_data("r1", "family-1")).await.unwrap();

            let duplicate = tokens
                .create(CreateMcpOAuthRefreshTokenData {
                    token_hash: "refresh-hash-r1".to_string(),
                    ..refresh_data("r2", "family-2")
                })
                .await;

            assert!(matches!(duplicate, Err(DomainError::Internal(_))));
        }

        #[tokio::test]
        async fn deleting_the_user_cascades_to_their_tokens() {
            let db = seeded().await;
            let tokens = PgMcpOAuthRefreshTokenRepository::new(db.clone());
            tokens.create(refresh_data("r1", "family-1")).await.unwrap();

            delete_user(&db, "user-1").await;

            assert_eq!(tokens.find_by_token_hash("refresh-hash-r1").await.unwrap(), None);
        }
    }

    mod access_tokens {
        use super::*;

        #[tokio::test]
        async fn creates_a_token_and_finds_it_by_hash() {
            let tokens = PgMcpOAuthTokenRepository::new(seeded().await);
            let data = CreateMcpOAuthAccessTokenData {
                scope: McpOAuthScope::Full,
                ..access_data("a1", "family-1")
            };

            let created = tokens.create(data.clone()).await.unwrap();

            assert_eq!(created.user_id, "user-1");
            assert_eq!(created.client_id, "client-1");
            assert_eq!(created.family_id, "family-1");
            assert_eq!(created.scope, McpOAuthScope::Full);
            assert_eq!(created.audience, "https://api.example.com/mcp");
            assert_eq!(created.expires_at, data.expires_at);
            assert_eq!(created.revoked_at, None);
            assert_eq!(created.last_used_at, None);
            assert_eq!(tokens.find_by_token_hash("access-hash-a1").await.unwrap(), Some(created));
            assert_eq!(tokens.find_by_token_hash("nope").await.unwrap(), None);
        }

        #[tokio::test]
        async fn find_by_token_hash_still_returns_an_expired_or_revoked_token() {
            // The repository does not filter on expiry or revocation: the
            // caller reads `expires_at` and `revoked_at` and decides.
            let tokens = PgMcpOAuthTokenRepository::new(seeded().await);
            let expired_at = now() - hours(1);
            tokens
                .create(CreateMcpOAuthAccessTokenData {
                    expires_at: expired_at,
                    ..access_data("a1", "family-1")
                })
                .await
                .unwrap();
            tokens.revoke("a1").await.unwrap();

            let found = tokens.find_by_token_hash("access-hash-a1").await.unwrap().unwrap();

            assert_eq!(found.expires_at, expired_at);
            assert!(found.revoked_at.is_some());
        }

        #[tokio::test]
        async fn update_last_used_and_revoke_stamp_only_that_token() {
            let tokens = PgMcpOAuthTokenRepository::new(seeded().await);
            tokens.create(access_data("a1", "family-1")).await.unwrap();
            tokens.create(access_data("a2", "family-1")).await.unwrap();
            let before = now();

            tokens.update_last_used("a1").await.unwrap();
            tokens.revoke("a1").await.unwrap();

            let touched = tokens.find_by_token_hash("access-hash-a1").await.unwrap().unwrap();
            assert!(touched.last_used_at.unwrap() >= before);
            assert!(touched.revoked_at.unwrap() >= before);
            let untouched = tokens.find_by_token_hash("access-hash-a2").await.unwrap().unwrap();
            assert_eq!(untouched.last_used_at, None);
            assert_eq!(untouched.revoked_at, None);
        }

        #[tokio::test]
        async fn revoking_a_family_returns_the_hashes_it_revoked_and_keeps_earlier_revocations() {
            let db = seeded().await;
            let tokens = PgMcpOAuthTokenRepository::new(db.clone());
            for (id, family) in [
                ("live-1", "family-1"),
                ("live-2", "family-1"),
                ("earlier", "family-1"),
                ("other", "family-2"),
            ] {
                tokens.create(access_data(id, family)).await.unwrap();
            }
            let earlier = now() - hours(2);
            set_timestamp(&db, "McpOAuthAccessToken", "revokedAt", "earlier", earlier).await;
            let revoked_at = now();

            let mut hashes = tokens.revoke_family("family-1", revoked_at).await.unwrap();

            hashes.sort();
            assert_eq!(hashes, vec!["access-hash-live-1", "access-hash-live-2"]);
            let revoked_of = |id: &'static str| {
                let tokens = &tokens;
                async move {
                    let hash = format!("access-hash-{id}");
                    tokens.find_by_token_hash(&hash).await.unwrap().unwrap().revoked_at
                }
            };
            assert_eq!(revoked_of("live-1").await, Some(revoked_at));
            assert_eq!(revoked_of("live-2").await, Some(revoked_at));
            assert_eq!(revoked_of("earlier").await, Some(earlier));
            assert_eq!(revoked_of("other").await, None);
            // Nothing left to revoke the second time.
            assert_eq!(
                tokens.revoke_family("family-1", now()).await.unwrap(),
                Vec::<String>::new()
            );
        }

        #[tokio::test]
        async fn a_token_hash_is_unique() {
            let tokens = PgMcpOAuthTokenRepository::new(seeded().await);
            tokens.create(access_data("a1", "family-1")).await.unwrap();

            let duplicate = tokens
                .create(CreateMcpOAuthAccessTokenData {
                    token_hash: "access-hash-a1".to_string(),
                    ..access_data("a2", "family-2")
                })
                .await;

            assert!(matches!(duplicate, Err(DomainError::Internal(_))));
        }

        #[tokio::test]
        async fn deleting_the_user_cascades_to_their_tokens() {
            let db = seeded().await;
            let tokens = PgMcpOAuthTokenRepository::new(db.clone());
            tokens.create(access_data("a1", "family-1")).await.unwrap();

            delete_user(&db, "user-1").await;

            assert_eq!(tokens.find_by_token_hash("access-hash-a1").await.unwrap(), None);
        }
    }

    mod grants {
        use super::*;

        /// One consent: its authorization code plus a live refresh token and
        /// an access token in the same family.
        async fn seed_grant(db: &Db, family_id: &str, user_id: &str, scope: McpOAuthScope) {
            PgMcpOAuthAuthorizationCodeRepository::new(db.clone())
                .create(CreateMcpOAuthAuthorizationCodeData {
                    user_id: user_id.to_string(),
                    scope,
                    ..code_data(&format!("code-{family_id}"), family_id)
                })
                .await
                .unwrap();
            PgMcpOAuthRefreshTokenRepository::new(db.clone())
                .create(CreateMcpOAuthRefreshTokenData {
                    user_id: user_id.to_string(),
                    scope,
                    ..refresh_data(&format!("refresh-{family_id}"), family_id)
                })
                .await
                .unwrap();
            PgMcpOAuthTokenRepository::new(db.clone())
                .create(CreateMcpOAuthAccessTokenData {
                    user_id: user_id.to_string(),
                    scope,
                    ..access_data(&format!("access-{family_id}"), family_id)
                })
                .await
                .unwrap();
        }

        #[tokio::test]
        async fn describes_a_live_grant_by_the_consent_that_created_it() {
            let db = seeded_with_client().await;
            seed_grant(&db, "family-1", "user-1", McpOAuthScope::Full).await;
            let consent = PgMcpOAuthAuthorizationCodeRepository::new(db.clone())
                .find_by_code_hash("code-hash-code-family-1")
                .await
                .unwrap()
                .unwrap();

            let grants = PgMcpOAuthGrantRepository::new(db)
                .find_active_by_user_id("user-1", now())
                .await
                .unwrap();

            assert_eq!(grants.len(), 1);
            assert_eq!(grants[0].id, "family-1");
            assert_eq!(grants[0].user_id, "user-1");
            assert_eq!(grants[0].client_id, "client-1");
            assert_eq!(grants[0].client_name, "Claude");
            assert_eq!(grants[0].scope, McpOAuthScope::Full);
            assert_eq!(grants[0].authorized_at, consent.created_at);
            assert_eq!(grants[0].last_used_at, None);
        }

        #[tokio::test]
        async fn never_returns_another_users_grants() {
            let db = seeded_with_client().await;
            seed_grant(&db, "family-1", "user-1", McpOAuthScope::Read).await;
            seed_grant(&db, "family-2", "user-2", McpOAuthScope::Read).await;

            let grants = PgMcpOAuthGrantRepository::new(db)
                .find_active_by_user_id("user-2", now())
                .await
                .unwrap();

            let ids: Vec<&str> = grants.iter().map(|grant| grant.id.as_str()).collect();
            assert_eq!(ids, vec!["family-2"]);
        }

        #[tokio::test]
        async fn omits_a_grant_whose_refresh_tokens_were_revoked() {
            let db = seeded_with_client().await;
            seed_grant(&db, "family-1", "user-1", McpOAuthScope::Read).await;
            seed_grant(&db, "family-2", "user-1", McpOAuthScope::Read).await;
            PgMcpOAuthRefreshTokenRepository::new(db.clone())
                .revoke_family("family-1", now())
                .await
                .unwrap();

            let grants = PgMcpOAuthGrantRepository::new(db)
                .find_active_by_user_id("user-1", now())
                .await
                .unwrap();

            let ids: Vec<&str> = grants.iter().map(|grant| grant.id.as_str()).collect();
            assert_eq!(ids, vec!["family-2"]);
        }

        #[tokio::test]
        async fn omits_a_grant_whose_refresh_token_has_expired() {
            let db = seeded_with_client().await;
            seed_grant(&db, "family-1", "user-1", McpOAuthScope::Read).await;
            let grants = PgMcpOAuthGrantRepository::new(db.clone());
            let expires_at = now() + hours(1);
            set_timestamp(&db, "McpOAuthRefreshToken", "expiresAt", "refresh-family-1", expires_at)
                .await;

            // Live strictly before the expiry instant, gone at it.
            let just_before = expires_at - TimeDelta::milliseconds(1);
            assert_eq!(
                grants.find_active_by_user_id("user-1", just_before).await.unwrap().len(),
                1
            );
            assert_eq!(grants.find_active_by_user_id("user-1", expires_at).await.unwrap(), vec![]);
        }

        #[tokio::test]
        async fn keeps_a_grant_whose_access_token_expired_but_whose_refresh_token_has_not() {
            let db = seeded_with_client().await;
            seed_grant(&db, "family-1", "user-1", McpOAuthScope::Read).await;
            let past = now() - hours(1);
            set_timestamp(&db, "McpOAuthAccessToken", "expiresAt", "access-family-1", past).await;
            // A consumed, expired code is still the record of the consent.
            set_timestamp(&db, "McpOAuthAuthorizationCode", "expiresAt", "code-family-1", past)
                .await;

            let grants = PgMcpOAuthGrantRepository::new(db)
                .find_active_by_user_id("user-1", now())
                .await
                .unwrap();

            assert_eq!(grants.len(), 1);
        }

        #[tokio::test]
        async fn a_rotated_family_is_one_grant_reporting_its_most_recent_use() {
            let db = seeded_with_client().await;
            seed_grant(&db, "family-1", "user-1", McpOAuthScope::Read).await;
            let refresh = PgMcpOAuthRefreshTokenRepository::new(db.clone());
            let access = PgMcpOAuthTokenRepository::new(db.clone());
            // Two rotations: the old refresh tokens are spent, new ones live.
            refresh.mark_used("refresh-family-1", now()).await.unwrap();
            refresh.create(refresh_data("rotated-1", "family-1")).await.unwrap();
            refresh.create(refresh_data("rotated-2", "family-1")).await.unwrap();
            access.create(access_data("rotated-1", "family-1")).await.unwrap();
            access.create(access_data("never-used", "family-1")).await.unwrap();
            let latest = now() - hours(1);
            for (id, used) in [("access-family-1", latest - hours(5)), ("rotated-1", latest)] {
                set_timestamp(&db, "McpOAuthAccessToken", "lastUsedAt", id, used).await;
            }

            let grants = PgMcpOAuthGrantRepository::new(db)
                .find_active_by_user_id("user-1", now())
                .await
                .unwrap();

            assert_eq!(grants.len(), 1);
            assert_eq!(grants[0].last_used_at, Some(latest));
        }

        #[tokio::test]
        async fn lists_the_most_recently_authorized_grant_first() {
            let db = seeded_with_client().await;
            seed_client(&db, "client-2", "Cursor").await;
            for family in ["oldest", "newest", "middle"] {
                seed_grant(&db, family, "user-1", McpOAuthScope::Read).await;
            }
            sqlx::query(
                r#"UPDATE "McpOAuthAuthorizationCode" SET "clientId" = 'client-2'
                   WHERE "id" = 'code-newest'"#,
            )
            .execute(db.pool())
            .await
            .unwrap();
            let base = now();
            for (family, age) in [("oldest", 3), ("newest", 1), ("middle", 2)] {
                let id = format!("code-{family}");
                set_timestamp(
                    &db,
                    "McpOAuthAuthorizationCode",
                    "createdAt",
                    &id,
                    base - hours(age),
                )
                .await;
            }

            let grants = PgMcpOAuthGrantRepository::new(db)
                .find_active_by_user_id("user-1", now())
                .await
                .unwrap();

            let ids: Vec<&str> = grants.iter().map(|grant| grant.id.as_str()).collect();
            assert_eq!(ids, vec!["newest", "middle", "oldest"]);
            // The name comes from the client the consent was given to.
            assert_eq!(grants[0].client_name, "Cursor");
            assert_eq!(grants[1].client_name, "Claude");
        }

        #[tokio::test]
        async fn returns_nothing_for_a_user_who_has_authorized_no_clients() {
            let db = seeded_with_client().await;
            seed_grant(&db, "family-1", "user-1", McpOAuthScope::Read).await;

            let grants = PgMcpOAuthGrantRepository::new(db)
                .find_active_by_user_id("user-2", now())
                .await
                .unwrap();

            assert_eq!(grants, vec![]);
        }

        #[tokio::test]
        async fn a_code_that_never_yielded_a_refresh_token_is_not_a_grant() {
            let db = seeded_with_client().await;
            PgMcpOAuthAuthorizationCodeRepository::new(db.clone())
                .create(code_data("code-1", "family-1"))
                .await
                .unwrap();

            let grants = PgMcpOAuthGrantRepository::new(db)
                .find_active_by_user_id("user-1", now())
                .await
                .unwrap();

            assert_eq!(grants, vec![]);
        }
    }
}
