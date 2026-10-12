use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::postgres::PgRow;
use sqlx::Row;

use crate::domain::session::Session;
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateSessionData, RotateRefreshTokenData, SessionRepository};

pub struct PgSessionRepository {
    db: Db,
}

impl PgSessionRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> Result<Session, sqlx::Error> {
    Ok(Session {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        user_agent: row.try_get("userAgent")?,
        ip_address: row.try_get("ipAddress")?,
        device_label: row.try_get("deviceLabel")?,
        location: row.try_get("location")?,
        last_used_at: row.try_get("lastUsedAt")?,
        created_at: row.try_get("createdAt")?,
        expires_at: row.try_get("expiresAt")?,
        revoked_at: row.try_get("revokedAt")?,
        current_refresh_token_id: row.try_get("currentRefreshTokenId")?,
        previous_refresh_token_id: row.try_get("previousRefreshTokenId")?,
        previous_rotated_at: row.try_get("previousRotatedAt")?,
    })
}

#[async_trait]
impl SessionRepository for PgSessionRepository {
    async fn create(&self, data: CreateSessionData) -> DomainResult<Session> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "Session"
                 ("id", "userId", "userAgent", "ipAddress", "deviceLabel", "location",
                  "expiresAt", "currentRefreshTokenId", "lastUsedAt", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.user_id)
        .bind(&data.user_agent)
        .bind(&data.ip_address)
        .bind(&data.device_label)
        .bind(&data.location)
        .bind(data.expires_at)
        .bind(&data.current_refresh_token_id)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        Ok(to_entity(&row)?)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Session>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(r#"SELECT * FROM "Session" WHERE "id" = $1 LIMIT 1"#)
            .bind(id)
            .fetch_optional(&mut *conn)
            .await?;
        Ok(row.as_ref().map(to_entity).transpose()?)
    }

    async fn find_by_id_and_user_id(
        &self,
        id: &str,
        user_id: &str,
    ) -> DomainResult<Option<Session>> {
        let mut conn = self.db.conn().await?;
        let row =
            sqlx::query(r#"SELECT * FROM "Session" WHERE "id" = $1 AND "userId" = $2 LIMIT 1"#)
                .bind(id)
                .bind(user_id)
                .fetch_optional(&mut *conn)
                .await?;
        Ok(row.as_ref().map(to_entity).transpose()?)
    }

    async fn find_active_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Session>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT * FROM "Session"
               WHERE "userId" = $1 AND "revokedAt" IS NULL AND "expiresAt" > $2
               ORDER BY "lastUsedAt" DESC"#,
        )
        .bind(user_id)
        .bind(now())
        .fetch_all(&mut *conn)
        .await?;
        Ok(rows.iter().map(to_entity).collect::<Result<_, _>>()?)
    }

    async fn touch(&self, id: &str, expires_at: DateTime<Utc>) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"UPDATE "Session" SET "lastUsedAt" = $2, "expiresAt" = $3 WHERE "id" = $1"#)
            .bind(id)
            .bind(now())
            .bind(expires_at)
            .execute(&mut *conn)
            .await?;
        Ok(())
    }

    async fn rotate_refresh_token(
        &self,
        id: &str,
        data: RotateRefreshTokenData,
    ) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(
            r#"UPDATE "Session"
               SET "lastUsedAt" = $2, "expiresAt" = $3, "currentRefreshTokenId" = $4,
                   "previousRefreshTokenId" = $5, "previousRotatedAt" = $6
               WHERE "id" = $1"#,
        )
        .bind(id)
        .bind(now())
        .bind(data.expires_at)
        .bind(&data.current_refresh_token_id)
        .bind(&data.previous_refresh_token_id)
        .bind(data.previous_rotated_at)
        .execute(&mut *conn)
        .await?;
        Ok(())
    }

    async fn revoke(&self, id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"UPDATE "Session" SET "revokedAt" = $2 WHERE "id" = $1"#)
            .bind(id)
            .bind(now())
            .execute(&mut *conn)
            .await?;
        Ok(())
    }

    async fn revoke_all_for_user_except(&self, user_id: &str, except_id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(
            r#"UPDATE "Session" SET "revokedAt" = $3
               WHERE "userId" = $1 AND "id" <> $2 AND "revokedAt" IS NULL"#,
        )
        .bind(user_id)
        .bind(except_id)
        .bind(now())
        .execute(&mut *conn)
        .await?;
        Ok(())
    }

    async fn revoke_all_for_user(&self, user_id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(
            r#"UPDATE "Session" SET "revokedAt" = $2 WHERE "userId" = $1 AND "revokedAt" IS NULL"#,
        )
        .bind(user_id)
        .bind(now())
        .execute(&mut *conn)
        .await?;
        Ok(())
    }

    async fn find_distinct_user_agents_by_user_id(
        &self,
        user_id: &str,
    ) -> DomainResult<Vec<String>> {
        let mut conn = self.db.conn().await?;
        let user_agents: Vec<Option<String>> =
            sqlx::query_scalar(r#"SELECT DISTINCT "userAgent" FROM "Session" WHERE "userId" = $1"#)
                .bind(user_id)
                .fetch_all(&mut *conn)
                .await?;
        Ok(user_agents.into_iter().flatten().collect())
    }
}
