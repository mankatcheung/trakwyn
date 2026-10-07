use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use crate::domain::llm_api_key::LlmApiKey;
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{LlmApiKeyRepository, UpsertLlmApiKeyData};

pub struct PgLlmApiKeyRepository {
    db: Db,
}

impl PgLlmApiKeyRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> Result<LlmApiKey, sqlx::Error> {
    Ok(LlmApiKey {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        provider: row.try_get("provider")?,
        api_key: row.try_get("apiKey")?,
        model: row.try_get("model")?,
        base_url: row.try_get("baseUrl")?,
        monthly_token_limit: row.try_get("monthlyTokenLimit")?,
        created_at: row.try_get("createdAt")?,
        updated_at: row.try_get("updatedAt")?,
    })
}

#[async_trait]
impl LlmApiKeyRepository for PgLlmApiKeyRepository {
    /// Find-then-write, as `apps/api` does it, rather than `ON CONFLICT`: the
    /// update leaves `id`, `createdAt` and `monthlyTokenLimit` alone.
    async fn upsert(&self, data: UpsertLlmApiKeyData) -> DomainResult<LlmApiKey> {
        let existing = self.find_by_user_id_and_provider(&data.user_id, &data.provider).await?;

        let mut conn = self.db.conn().await?;
        if let Some(existing) = existing {
            let row = sqlx::query(
                r#"UPDATE "LlmApiKey"
                   SET "apiKey" = $2, "model" = $3, "baseUrl" = $4, "updatedAt" = $5
                   WHERE "id" = $1
                   RETURNING *"#,
            )
            .bind(&existing.id)
            .bind(&data.api_key)
            .bind(&data.model)
            .bind(&data.base_url)
            .bind(now())
            .fetch_one(&mut *conn)
            .await?;
            return Ok(to_entity(&row)?);
        }

        let row = sqlx::query(
            r#"INSERT INTO "LlmApiKey"
                 ("id", "userId", "provider", "apiKey", "model", "baseUrl", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.user_id)
        .bind(&data.provider)
        .bind(&data.api_key)
        .bind(&data.model)
        .bind(&data.base_url)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        Ok(to_entity(&row)?)
    }

    async fn find_by_user_id_and_provider(
        &self,
        user_id: &str,
        provider: &str,
    ) -> DomainResult<Option<LlmApiKey>> {
        let mut conn = self.db.conn().await?;
        let row =
            sqlx::query(r#"SELECT * FROM "LlmApiKey" WHERE "userId" = $1 AND "provider" = $2"#)
                .bind(user_id)
                .bind(provider)
                .fetch_optional(&mut *conn)
                .await?;
        Ok(row.as_ref().map(to_entity).transpose()?)
    }

    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<LlmApiKey>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(r#"SELECT * FROM "LlmApiKey" WHERE "userId" = $1"#)
            .bind(user_id)
            .fetch_all(&mut *conn)
            .await?;
        Ok(rows.iter().map(to_entity).collect::<Result<_, _>>()?)
    }

    async fn set_monthly_token_limit(
        &self,
        user_id: &str,
        provider: &str,
        monthly_token_limit: Option<i64>,
    ) -> DomainResult<Option<LlmApiKey>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"UPDATE "LlmApiKey" SET "monthlyTokenLimit" = $3, "updatedAt" = $4
               WHERE "userId" = $1 AND "provider" = $2
               RETURNING *"#,
        )
        .bind(user_id)
        .bind(provider)
        .bind(monthly_token_limit)
        .bind(now())
        .fetch_optional(&mut *conn)
        .await?;
        Ok(row.as_ref().map(to_entity).transpose()?)
    }

    async fn delete(&self, user_id: &str, provider: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"DELETE FROM "LlmApiKey" WHERE "userId" = $1 AND "provider" = $2"#)
            .bind(user_id)
            .bind(provider)
            .execute(&mut *conn)
            .await?;
        Ok(())
    }
}
