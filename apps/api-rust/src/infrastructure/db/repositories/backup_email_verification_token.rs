use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use crate::domain::backup_email_verification_token::BackupEmailVerificationToken;
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{
    BackupEmailVerificationTokenRepository, CreateBackupEmailVerificationTokenData,
};

pub struct PgBackupEmailVerificationTokenRepository {
    db: Db,
}

impl PgBackupEmailVerificationTokenRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> Result<BackupEmailVerificationToken, sqlx::Error> {
    Ok(BackupEmailVerificationToken {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        token_hash: row.try_get("tokenHash")?,
        new_backup_email: row.try_get("newBackupEmail")?,
        expires_at: row.try_get("expiresAt")?,
        used_at: row.try_get("usedAt")?,
        created_at: row.try_get("createdAt")?,
    })
}

#[async_trait]
impl BackupEmailVerificationTokenRepository for PgBackupEmailVerificationTokenRepository {
    async fn create(
        &self,
        data: CreateBackupEmailVerificationTokenData,
    ) -> DomainResult<BackupEmailVerificationToken> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "BackupEmailVerificationToken"
                 ("id", "userId", "tokenHash", "newBackupEmail", "expiresAt", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.user_id)
        .bind(&data.token_hash)
        .bind(&data.new_backup_email)
        .bind(data.expires_at)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        Ok(to_entity(&row)?)
    }

    async fn find_by_token_hash(
        &self,
        token_hash: &str,
    ) -> DomainResult<Option<BackupEmailVerificationToken>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"SELECT * FROM "BackupEmailVerificationToken" WHERE "tokenHash" = $1 LIMIT 1"#,
        )
        .bind(token_hash)
        .fetch_optional(&mut *conn)
        .await?;
        Ok(row.as_ref().map(to_entity).transpose()?)
    }

    async fn mark_used(&self, id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"UPDATE "BackupEmailVerificationToken" SET "usedAt" = $2 WHERE "id" = $1"#)
            .bind(id)
            .bind(now())
            .execute(&mut *conn)
            .await?;
        Ok(())
    }

    async fn delete_all_for_user(&self, user_id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"DELETE FROM "BackupEmailVerificationToken" WHERE "userId" = $1"#)
            .bind(user_id)
            .execute(&mut *conn)
            .await?;
        Ok(())
    }
}
