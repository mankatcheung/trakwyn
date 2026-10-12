use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use super::support::unknown_value;
use crate::domain::api_token::{ApiToken, ApiTokenScope};
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{ApiTokenRepository, ApiTokenWithUserEmail, CreateApiTokenData};

pub struct PgApiTokenRepository {
    db: Db,
}

impl PgApiTokenRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> DomainResult<ApiToken> {
    let scope: String = row.try_get("scope")?;
    Ok(ApiToken {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        name: row.try_get("name")?,
        token_hash: row.try_get("tokenHash")?,
        scope: ApiTokenScope::parse(&scope)
            .ok_or_else(|| unknown_value("ApiToken", "scope", &scope))?,
        last_used_at: row.try_get("lastUsedAt")?,
        created_at: row.try_get("createdAt")?,
    })
}

#[async_trait]
impl ApiTokenRepository for PgApiTokenRepository {
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<ApiToken>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT * FROM "ApiToken" WHERE "userId" = $1 ORDER BY "createdAt" DESC"#,
        )
        .bind(user_id)
        .fetch_all(&mut *conn)
        .await?;
        rows.iter().map(to_entity).collect()
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<ApiToken>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(r#"SELECT * FROM "ApiToken" WHERE "id" = $1 LIMIT 1"#)
            .bind(id)
            .fetch_optional(&mut *conn)
            .await?;
        row.as_ref().map(to_entity).transpose()
    }

    async fn find_by_token_hash(
        &self,
        token_hash: &str,
    ) -> DomainResult<Option<ApiTokenWithUserEmail>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"SELECT t.*, u."email" AS "userEmail" FROM "ApiToken" t
               INNER JOIN "User" u ON t."userId" = u."id"
               WHERE t."tokenHash" = $1
               LIMIT 1"#,
        )
        .bind(token_hash)
        .fetch_optional(&mut *conn)
        .await?;
        let Some(row) = row else { return Ok(None) };
        Ok(Some(ApiTokenWithUserEmail {
            token: to_entity(&row)?,
            user_email: row.try_get("userEmail")?,
        }))
    }

    async fn create(&self, data: CreateApiTokenData) -> DomainResult<ApiToken> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "ApiToken" ("id", "userId", "name", "tokenHash", "scope", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.user_id)
        .bind(&data.name)
        .bind(&data.token_hash)
        .bind(data.scope.as_str())
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        to_entity(&row)
    }

    async fn update_last_used(&self, id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"UPDATE "ApiToken" SET "lastUsedAt" = $2 WHERE "id" = $1"#)
            .bind(id)
            .bind(now())
            .execute(&mut *conn)
            .await?;
        Ok(())
    }

    async fn delete(&self, id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"DELETE FROM "ApiToken" WHERE "id" = $1"#)
            .bind(id)
            .execute(&mut *conn)
            .await?;
        Ok(())
    }

    async fn find_by_id_and_user_id(
        &self,
        id: &str,
        user_id: &str,
    ) -> DomainResult<Option<ApiToken>> {
        let mut conn = self.db.conn().await?;
        let row =
            sqlx::query(r#"SELECT * FROM "ApiToken" WHERE "id" = $1 AND "userId" = $2 LIMIT 1"#)
                .bind(id)
                .bind(user_id)
                .fetch_optional(&mut *conn)
                .await?;
        row.as_ref().map(to_entity).transpose()
    }
}
