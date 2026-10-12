use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use crate::domain::share_link::ShareLink;
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateShareLinkData, ShareLinkRepository};

pub struct PgShareLinkRepository {
    db: Db,
}

impl PgShareLinkRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> Result<ShareLink, sqlx::Error> {
    Ok(ShareLink {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        name: row.try_get("name")?,
        token_hash: row.try_get("tokenHash")?,
        last_used_at: row.try_get("lastUsedAt")?,
        created_at: row.try_get("createdAt")?,
    })
}

#[async_trait]
impl ShareLinkRepository for PgShareLinkRepository {
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<ShareLink>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT * FROM "ShareLink" WHERE "userId" = $1 ORDER BY "createdAt" DESC"#,
        )
        .bind(user_id)
        .fetch_all(&mut *conn)
        .await?;
        Ok(rows.iter().map(to_entity).collect::<Result<_, _>>()?)
    }

    async fn find_by_token_hash(&self, token_hash: &str) -> DomainResult<Option<ShareLink>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(r#"SELECT * FROM "ShareLink" WHERE "tokenHash" = $1 LIMIT 1"#)
            .bind(token_hash)
            .fetch_optional(&mut *conn)
            .await?;
        Ok(row.as_ref().map(to_entity).transpose()?)
    }

    async fn find_by_id_and_user_id(
        &self,
        id: &str,
        user_id: &str,
    ) -> DomainResult<Option<ShareLink>> {
        let mut conn = self.db.conn().await?;
        let row =
            sqlx::query(r#"SELECT * FROM "ShareLink" WHERE "id" = $1 AND "userId" = $2 LIMIT 1"#)
                .bind(id)
                .bind(user_id)
                .fetch_optional(&mut *conn)
                .await?;
        Ok(row.as_ref().map(to_entity).transpose()?)
    }

    async fn create(&self, data: CreateShareLinkData) -> DomainResult<ShareLink> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "ShareLink" ("id", "userId", "name", "tokenHash", "createdAt")
               VALUES ($1, $2, $3, $4, $5)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.user_id)
        .bind(&data.name)
        .bind(&data.token_hash)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        Ok(to_entity(&row)?)
    }

    async fn update_last_used(&self, id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"UPDATE "ShareLink" SET "lastUsedAt" = $2 WHERE "id" = $1"#)
            .bind(id)
            .bind(now())
            .execute(&mut *conn)
            .await?;
        Ok(())
    }

    async fn delete(&self, id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"DELETE FROM "ShareLink" WHERE "id" = $1"#)
            .bind(id)
            .execute(&mut *conn)
            .await?;
        Ok(())
    }
}
