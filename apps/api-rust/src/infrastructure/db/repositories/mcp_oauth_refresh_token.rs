use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::postgres::PgRow;
use sqlx::Row;

use super::support::unknown_value;
use crate::domain::mcp_oauth::{McpOAuthRefreshToken, McpOAuthScope};
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateMcpOAuthRefreshTokenData, McpOAuthRefreshTokenRepository};

pub struct PgMcpOAuthRefreshTokenRepository {
    db: Db,
}

impl PgMcpOAuthRefreshTokenRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> DomainResult<McpOAuthRefreshToken> {
    let scope: String = row.try_get("scope")?;
    Ok(McpOAuthRefreshToken {
        id: row.try_get("id")?,
        token_hash: row.try_get("tokenHash")?,
        family_id: row.try_get("familyId")?,
        client_id: row.try_get("clientId")?,
        user_id: row.try_get("userId")?,
        scope: McpOAuthScope::parse(&scope)
            .ok_or_else(|| unknown_value("McpOAuthRefreshToken", "scope", &scope))?,
        expires_at: row.try_get("expiresAt")?,
        used_at: row.try_get("usedAt")?,
        revoked_at: row.try_get("revokedAt")?,
        created_at: row.try_get("createdAt")?,
    })
}

#[async_trait]
impl McpOAuthRefreshTokenRepository for PgMcpOAuthRefreshTokenRepository {
    async fn create(
        &self,
        data: CreateMcpOAuthRefreshTokenData,
    ) -> DomainResult<McpOAuthRefreshToken> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "McpOAuthRefreshToken"
                 ("id", "tokenHash", "familyId", "clientId", "userId", "scope", "expiresAt",
                  "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.token_hash)
        .bind(&data.family_id)
        .bind(&data.client_id)
        .bind(&data.user_id)
        .bind(data.scope.as_str())
        .bind(data.expires_at)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        to_entity(&row)
    }

    async fn find_by_token_hash(
        &self,
        token_hash: &str,
    ) -> DomainResult<Option<McpOAuthRefreshToken>> {
        let mut conn = self.db.conn().await?;
        let row =
            sqlx::query(r#"SELECT * FROM "McpOAuthRefreshToken" WHERE "tokenHash" = $1 LIMIT 1"#)
                .bind(token_hash)
                .fetch_optional(&mut *conn)
                .await?;
        row.as_ref().map(to_entity).transpose()
    }

    async fn mark_used(&self, id: &str, used_at: DateTime<Utc>) -> DomainResult<bool> {
        let mut conn = self.db.conn().await?;
        let result = sqlx::query(
            r#"UPDATE "McpOAuthRefreshToken" SET "usedAt" = $2
               WHERE "id" = $1 AND "usedAt" IS NULL"#,
        )
        .bind(id)
        .bind(used_at)
        .execute(&mut *conn)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    async fn revoke_family(&self, family_id: &str, revoked_at: DateTime<Utc>) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(
            r#"UPDATE "McpOAuthRefreshToken" SET "revokedAt" = $2
               WHERE "familyId" = $1 AND "revokedAt" IS NULL"#,
        )
        .bind(family_id)
        .bind(revoked_at)
        .execute(&mut *conn)
        .await?;
        Ok(())
    }
}
