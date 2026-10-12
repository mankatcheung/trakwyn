use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::postgres::PgRow;
use sqlx::Row;

use super::support::unknown_value;
use crate::domain::mcp_oauth::{
    McpOAuthAuthorizationCode, McpOAuthCodeChallengeMethod, McpOAuthScope,
};
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{
    CreateMcpOAuthAuthorizationCodeData, McpOAuthAuthorizationCodeRepository,
};

const TABLE: &str = "McpOAuthAuthorizationCode";

pub struct PgMcpOAuthAuthorizationCodeRepository {
    db: Db,
}

impl PgMcpOAuthAuthorizationCodeRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> DomainResult<McpOAuthAuthorizationCode> {
    let scope: String = row.try_get("scope")?;
    let method: String = row.try_get("codeChallengeMethod")?;
    Ok(McpOAuthAuthorizationCode {
        id: row.try_get("id")?,
        code_hash: row.try_get("codeHash")?,
        family_id: row.try_get("familyId")?,
        client_id: row.try_get("clientId")?,
        user_id: row.try_get("userId")?,
        redirect_uri: row.try_get("redirectUri")?,
        scope: McpOAuthScope::parse(&scope).ok_or_else(|| unknown_value(TABLE, "scope", &scope))?,
        code_challenge: row.try_get("codeChallenge")?,
        code_challenge_method: McpOAuthCodeChallengeMethod::parse(&method)
            .ok_or_else(|| unknown_value(TABLE, "codeChallengeMethod", &method))?,
        expires_at: row.try_get("expiresAt")?,
        consumed_at: row.try_get("consumedAt")?,
        created_at: row.try_get("createdAt")?,
    })
}

#[async_trait]
impl McpOAuthAuthorizationCodeRepository for PgMcpOAuthAuthorizationCodeRepository {
    async fn create(
        &self,
        data: CreateMcpOAuthAuthorizationCodeData,
    ) -> DomainResult<McpOAuthAuthorizationCode> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "McpOAuthAuthorizationCode"
                 ("id", "codeHash", "familyId", "clientId", "userId", "redirectUri", "scope",
                  "codeChallenge", "codeChallengeMethod", "expiresAt", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.code_hash)
        .bind(&data.family_id)
        .bind(&data.client_id)
        .bind(&data.user_id)
        .bind(&data.redirect_uri)
        .bind(data.scope.as_str())
        .bind(&data.code_challenge)
        .bind(data.code_challenge_method.as_str())
        .bind(data.expires_at)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        to_entity(&row)
    }

    async fn find_by_code_hash(
        &self,
        code_hash: &str,
    ) -> DomainResult<Option<McpOAuthAuthorizationCode>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"SELECT * FROM "McpOAuthAuthorizationCode" WHERE "codeHash" = $1 LIMIT 1"#,
        )
        .bind(code_hash)
        .fetch_optional(&mut *conn)
        .await?;
        row.as_ref().map(to_entity).transpose()
    }

    async fn consume(&self, id: &str, consumed_at: DateTime<Utc>) -> DomainResult<bool> {
        let mut conn = self.db.conn().await?;
        let result = sqlx::query(
            r#"UPDATE "McpOAuthAuthorizationCode" SET "consumedAt" = $2
               WHERE "id" = $1 AND "consumedAt" IS NULL"#,
        )
        .bind(id)
        .bind(consumed_at)
        .execute(&mut *conn)
        .await?;
        Ok(result.rows_affected() > 0)
    }
}
