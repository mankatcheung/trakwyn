use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use crate::domain::note::Note;
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateNoteData, NoteRepository};

pub struct PgNoteRepository {
    db: Db,
}

impl PgNoteRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> Result<Note, sqlx::Error> {
    Ok(Note {
        id: row.try_get("id")?,
        application_id: row.try_get("applicationId")?,
        content: row.try_get("content")?,
        created_at: row.try_get("createdAt")?,
        updated_at: row.try_get("updatedAt")?,
    })
}

fn to_entities(rows: &[PgRow]) -> DomainResult<Vec<Note>> {
    Ok(rows.iter().map(to_entity).collect::<Result<_, _>>()?)
}

#[async_trait]
impl NoteRepository for PgNoteRepository {
    async fn find_all_by_application_id(&self, application_id: &str) -> DomainResult<Vec<Note>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT * FROM "Note" WHERE "applicationId" = $1 ORDER BY "createdAt" DESC"#,
        )
        .bind(application_id)
        .fetch_all(&mut *conn)
        .await?;
        to_entities(&rows)
    }

    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64> {
        let mut conn = self.db.conn().await?;
        let count = sqlx::query_scalar(r#"SELECT count(*) FROM "Note" WHERE "applicationId" = $1"#)
            .bind(application_id)
            .fetch_one(&mut *conn)
            .await?;
        Ok(count)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Note>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(r#"SELECT * FROM "Note" WHERE "id" = $1 LIMIT 1"#)
            .bind(id)
            .fetch_optional(&mut *conn)
            .await?;
        Ok(row.as_ref().map(to_entity).transpose()?)
    }

    async fn create(&self, data: CreateNoteData) -> DomainResult<Note> {
        let mut conn = self.db.conn().await?;
        let timestamp = now();
        let row = sqlx::query(
            r#"INSERT INTO "Note" ("id", "applicationId", "content", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $4)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.application_id)
        .bind(&data.content)
        .bind(timestamp)
        .fetch_one(&mut *conn)
        .await?;
        Ok(to_entity(&row)?)
    }

    async fn update(&self, id: &str, content: &str) -> DomainResult<Note> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"UPDATE "Note" SET "content" = $2, "updatedAt" = $3 WHERE "id" = $1 RETURNING *"#,
        )
        .bind(id)
        .bind(content)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        Ok(to_entity(&row)?)
    }

    async fn delete(&self, id: &str, _application_id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"DELETE FROM "Note" WHERE "id" = $1"#).bind(id).execute(&mut *conn).await?;
        Ok(())
    }

    async fn find_recent_by_user_excluding_application(
        &self,
        user_id: &str,
        exclude_application_id: &str,
        limit: i64,
    ) -> DomainResult<Vec<Note>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT n.* FROM "Note" n
               INNER JOIN "JobApplication" a ON n."applicationId" = a."id"
               WHERE a."userId" = $1 AND a."id" <> $2 AND a."deletedAt" IS NULL
               ORDER BY n."createdAt" DESC
               LIMIT $3"#,
        )
        .bind(user_id)
        .bind(exclude_application_id)
        .bind(limit)
        .fetch_all(&mut *conn)
        .await?;
        to_entities(&rows)
    }
}
