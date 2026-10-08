use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::postgres::PgRow;
use sqlx::Row;

use super::support::unknown_value;
use crate::domain::mcp_oauth::{McpOAuthAccessToken, McpOAuthScope};
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateMcpOAuthAccessTokenData, McpOAuthTokenRepository};

pub struct PgMcpOAuthTokenRepository {
    db: Db,
}

impl PgMcpOAuthTokenRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> DomainResult<McpOAuthAccessToken> {
    let scope: String = row.try_get("scope")?;
    Ok(McpOAuthAccessToken {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        client_id: row.try_get("clientId")?,
        family_id: row.try_get("familyId")?,
        token_hash: row.try_get("tokenHash")?,
        scope: McpOAuthScope::parse(&scope)
            .ok_or_else(|| unknown_value("McpOAuthAccessToken", "scope", &scope))?,
        audience: row.try_get("audience")?,
        expires_at: row.try_get("expiresAt")?,
        revoked_at: row.try_get("revokedAt")?,
        last_used_at: row.try_get("lastUsedAt")?,
        created_at: row.try_get("createdAt")?,
    })
}

#[async_trait]
impl McpOAuthTokenRepository for PgMcpOAuthTokenRepository {
    async fn create(
        &self,
        data: CreateMcpOAuthAccessTokenData,
    ) -> DomainResult<McpOAuthAccessToken> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "McpOAuthAccessToken"
                 ("id", "userId", "clientId", "familyId", "tokenHash", "scope", "audience",
                  "expiresAt", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.user_id)
        .bind(&data.client_id)
        .bind(&data.family_id)
        .bind(&data.token_hash)
        .bind(data.scope.as_str())
        .bind(&data.audience)
        .bind(data.expires_at)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        to_entity(&row)
    }

    async fn find_by_token_hash(
        &self,
        token_hash: &str,
    ) -> DomainResult<Option<McpOAuthAccessToken>> {
        let mut conn = self.db.conn().await?;
        let row =
            sqlx::query(r#"SELECT * FROM "McpOAuthAccessToken" WHERE "tokenHash" = $1 LIMIT 1"#)
                .bind(token_hash)
                .fetch_optional(&mut *conn)
                .await?;
        row.as_ref().map(to_entity).transpose()
    }

    async fn update_last_used(&self, id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"UPDATE "McpOAuthAccessToken" SET "lastUsedAt" = $2 WHERE "id" = $1"#)
            .bind(id)
            .bind(now())
            .execute(&mut *conn)
            .await?;
        Ok(())
    }

    async fn revoke(&self, id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"UPDATE "McpOAuthAccessToken" SET "revokedAt" = $2 WHERE "id" = $1"#)
            .bind(id)
            .bind(now())
            .execute(&mut *conn)
            .await?;
        Ok(())
    }

    /// Grant-wide revocation. Only touches rows that are still live so an
    /// already-revoked token keeps its original `revokedAt` for the audit
    /// trail.
    async fn revoke_family(
        &self,
        family_id: &str,
        revoked_at: DateTime<Utc>,
    ) -> DomainResult<Vec<String>> {
        let mut conn = self.db.conn().await?;
        let hashes = sqlx::query_scalar(
            r#"UPDATE "McpOAuthAccessToken" SET "revokedAt" = $2
               WHERE "familyId" = $1 AND "revokedAt" IS NULL
               RETURNING "tokenHash""#,
        )
        .bind(family_id)
        .bind(revoked_at)
        .fetch_all(&mut *conn)
        .await?;
        Ok(hashes)
    }
}
