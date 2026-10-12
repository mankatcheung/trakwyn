use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use crate::domain::password_reset_token::PasswordResetToken;
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreatePasswordResetTokenData, PasswordResetTokenRepository};

pub struct PgPasswordResetTokenRepository {
    db: Db,
}

impl PgPasswordResetTokenRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> Result<PasswordResetToken, sqlx::Error> {
    Ok(PasswordResetToken {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        token_hash: row.try_get("tokenHash")?,
        expires_at: row.try_get("expiresAt")?,
        used_at: row.try_get("usedAt")?,
        created_at: row.try_get("createdAt")?,
    })
}

#[async_trait]
impl PasswordResetTokenRepository for PgPasswordResetTokenRepository {
    async fn create(&self, data: CreatePasswordResetTokenData) -> DomainResult<PasswordResetToken> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "PasswordResetToken"
                 ("id", "userId", "tokenHash", "expiresAt", "createdAt")
               VALUES ($1, $2, $3, $4, $5)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.user_id)
        .bind(&data.token_hash)
        .bind(data.expires_at)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        Ok(to_entity(&row)?)
    }

    async fn find_by_token_hash(
        &self,
        token_hash: &str,
    ) -> DomainResult<Option<PasswordResetToken>> {
        let mut conn = self.db.conn().await?;
        let row =
            sqlx::query(r#"SELECT * FROM "PasswordResetToken" WHERE "tokenHash" = $1 LIMIT 1"#)
                .bind(token_hash)
                .fetch_optional(&mut *conn)
                .await?;
        Ok(row.as_ref().map(to_entity).transpose()?)
    }

    async fn mark_used(&self, id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"UPDATE "PasswordResetToken" SET "usedAt" = $2 WHERE "id" = $1"#)
            .bind(id)
            .bind(now())
            .execute(&mut *conn)
            .await?;
        Ok(())
    }

    async fn delete_all_for_user(&self, user_id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"DELETE FROM "PasswordResetToken" WHERE "userId" = $1"#)
            .bind(user_id)
            .execute(&mut *conn)
            .await?;
        Ok(())
    }
}
