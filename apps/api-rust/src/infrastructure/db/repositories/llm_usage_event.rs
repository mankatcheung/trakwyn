use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::postgres::PgRow;
use sqlx::Row;

use crate::domain::llm_usage_event::LlmUsageSummary;
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{LlmUsageEventRepository, RecordLlmUsageEventData};

pub struct PgLlmUsageEventRepository {
    db: Db,
}

impl PgLlmUsageEventRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

/// `count(*)` is `bigint`, and so is `sum` over the `integer` token columns
/// (it would be `numeric` over `bigint` ones), so every total reads as `i64`.
fn to_summary(row: &PgRow) -> Result<LlmUsageSummary, sqlx::Error> {
    Ok(LlmUsageSummary {
        provider: row.try_get("provider")?,
        request_count: row.try_get("requestCount")?,
        prompt_tokens: row.try_get("promptTokens")?,
        completion_tokens: row.try_get("completionTokens")?,
        cache_read_tokens: row.try_get("cacheReadTokens")?,
        cache_write_tokens: row.try_get("cacheWriteTokens")?,
        last_used_at: row.try_get("lastUsedAt")?,
    })
}

#[async_trait]
impl LlmUsageEventRepository for PgLlmUsageEventRepository {
    async fn record(&self, data: RecordLlmUsageEventData) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(
            r#"INSERT INTO "LlmUsageEvent"
                 ("id", "userId", "provider", "model", "promptTokens", "completionTokens",
                  "cacheReadTokens", "cacheWriteTokens", "estimated", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)"#,
        )
        .bind(&data.id)
        .bind(&data.user_id)
        .bind(&data.provider)
        .bind(&data.model)
        .bind(data.prompt_tokens)
        .bind(data.completion_tokens)
        .bind(data.cache_read_tokens)
        .bind(data.cache_write_tokens)
        .bind(data.estimated)
        .bind(now())
        .execute(&mut *conn)
        .await?;
        Ok(())
    }

    async fn summarize_by_user_id(
        &self,
        user_id: &str,
        since: DateTime<Utc>,
    ) -> DomainResult<Vec<LlmUsageSummary>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT "provider",
                      count(*) AS "requestCount",
                      coalesce(sum("promptTokens"), 0) AS "promptTokens",
                      coalesce(sum("completionTokens"), 0) AS "completionTokens",
                      coalesce(sum("cacheReadTokens"), 0) AS "cacheReadTokens",
                      coalesce(sum("cacheWriteTokens"), 0) AS "cacheWriteTokens",
                      max("createdAt") AS "lastUsedAt"
               FROM "LlmUsageEvent"
               WHERE "userId" = $1 AND "createdAt" >= $2
               GROUP BY "provider"
               ORDER BY max("createdAt") DESC"#,
        )
        .bind(user_id)
        .bind(since)
        .fetch_all(&mut *conn)
        .await?;
        Ok(rows.iter().map(to_summary).collect::<Result<_, _>>()?)
    }
}
