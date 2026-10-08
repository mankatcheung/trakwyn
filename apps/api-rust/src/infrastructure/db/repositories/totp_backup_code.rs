use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use crate::domain::totp_backup_code::TotpBackupCode;
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateTotpBackupCodeData, TotpBackupCodeRepository};

pub struct PgTotpBackupCodeRepository {
    db: Db,
}

impl PgTotpBackupCodeRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> Result<TotpBackupCode, sqlx::Error> {
    Ok(TotpBackupCode {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        code_hash: row.try_get("codeHash")?,
        used_at: row.try_get("usedAt")?,
        created_at: row.try_get("createdAt")?,
    })
}

#[async_trait]
impl TotpBackupCodeRepository for PgTotpBackupCodeRepository {
    async fn create(&self, data: CreateTotpBackupCodeData) -> DomainResult<TotpBackupCode> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "TotpBackupCode" ("id", "userId", "codeHash", "createdAt")
               VALUES ($1, $2, $3, $4)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.user_id)
        .bind(&data.code_hash)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        Ok(to_entity(&row)?)
    }

    async fn find_by_code_hash(&self, code_hash: &str) -> DomainResult<Option<TotpBackupCode>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(r#"SELECT * FROM "TotpBackupCode" WHERE "codeHash" = $1 LIMIT 1"#)
            .bind(code_hash)
            .fetch_optional(&mut *conn)
            .await?;
        Ok(row.as_ref().map(to_entity).transpose()?)
    }

    async fn mark_used(&self, id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"UPDATE "TotpBackupCode" SET "usedAt" = $2 WHERE "id" = $1"#)
            .bind(id)
            .bind(now())
            .execute(&mut *conn)
            .await?;
        Ok(())
    }

    async fn delete_all_for_user(&self, user_id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"DELETE FROM "TotpBackupCode" WHERE "userId" = $1"#)
            .bind(user_id)
            .execute(&mut *conn)
            .await?;
        Ok(())
    }
}
