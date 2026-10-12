use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use super::support::unknown_value;
use crate::domain::document_draft::{DocumentDraft, DocumentDraftType};
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{
    CreateDocumentDraftData, DocumentDraftRepository, UpdateDocumentDraftContentData,
};

const DEFAULT_CONTENT_JSON: &str = "{}";
const DEFAULT_PLAIN_TEXT: &str = "";

pub struct PgDocumentDraftRepository {
    db: Db,
}

impl PgDocumentDraftRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> DomainResult<DocumentDraft> {
    let draft_type: String = row.try_get("type")?;
    Ok(DocumentDraft {
        id: row.try_get("id")?,
        application_id: row.try_get("applicationId")?,
        draft_type: DocumentDraftType::parse(&draft_type)
            .ok_or_else(|| unknown_value("DocumentDraft", "type", &draft_type))?,
        title: row.try_get("title")?,
        content_json: row.try_get("contentJson")?,
        plain_text: row.try_get("plainText")?,
        source_document_id: row.try_get("sourceDocumentId")?,
        created_at: row.try_get("createdAt")?,
        updated_at: row.try_get("updatedAt")?,
    })
}

fn to_entities(rows: &[PgRow]) -> DomainResult<Vec<DocumentDraft>> {
    rows.iter().map(to_entity).collect()
}

#[async_trait]
impl DocumentDraftRepository for PgDocumentDraftRepository {
    async fn find_all_by_application_id(
        &self,
        application_id: &str,
    ) -> DomainResult<Vec<DocumentDraft>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT * FROM "DocumentDraft" WHERE "applicationId" = $1 ORDER BY "updatedAt" DESC"#,
        )
        .bind(application_id)
        .fetch_all(&mut *conn)
        .await?;
        to_entities(&rows)
    }

    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64> {
        let mut conn = self.db.conn().await?;
        let count = sqlx::query_scalar(
            r#"SELECT count(*) FROM "DocumentDraft" WHERE "applicationId" = $1"#,
        )
        .bind(application_id)
        .fetch_one(&mut *conn)
        .await?;
        Ok(count)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<DocumentDraft>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(r#"SELECT * FROM "DocumentDraft" WHERE "id" = $1 LIMIT 1"#)
            .bind(id)
            .fetch_optional(&mut *conn)
            .await?;
        row.as_ref().map(to_entity).transpose()
    }

    async fn create(&self, data: CreateDocumentDraftData) -> DomainResult<DocumentDraft> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "DocumentDraft"
                 ("id", "applicationId", "type", "title", "contentJson", "plainText",
                  "sourceDocumentId", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.application_id)
        .bind(data.draft_type.as_str())
        .bind(&data.title)
        .bind(data.content_json.as_deref().unwrap_or(DEFAULT_CONTENT_JSON))
        .bind(data.plain_text.as_deref().unwrap_or(DEFAULT_PLAIN_TEXT))
        .bind(&data.source_document_id)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        to_entity(&row)
    }

    async fn update_content(
        &self,
        id: &str,
        data: UpdateDocumentDraftContentData,
    ) -> DomainResult<DocumentDraft> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"UPDATE "DocumentDraft"
               SET "contentJson" = $2, "plainText" = $3, "updatedAt" = $4
               WHERE "id" = $1
               RETURNING *"#,
        )
        .bind(id)
        .bind(&data.content_json)
        .bind(&data.plain_text)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        to_entity(&row)
    }

    async fn rename(&self, id: &str, title: &str) -> DomainResult<DocumentDraft> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"UPDATE "DocumentDraft" SET "title" = $2, "updatedAt" = $3
               WHERE "id" = $1
               RETURNING *"#,
        )
        .bind(id)
        .bind(title)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        to_entity(&row)
    }

    async fn delete(&self, id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"DELETE FROM "DocumentDraft" WHERE "id" = $1"#)
            .bind(id)
            .execute(&mut *conn)
            .await?;
        Ok(())
    }

    async fn find_recent_cover_letters_by_user_excluding_application(
        &self,
        user_id: &str,
        exclude_application_id: &str,
        limit: i64,
    ) -> DomainResult<Vec<DocumentDraft>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT d.* FROM "DocumentDraft" d
               INNER JOIN "JobApplication" a ON d."applicationId" = a."id"
               WHERE a."userId" = $1 AND d."type" = $2 AND a."id" <> $3 AND a."deletedAt" IS NULL
               ORDER BY d."updatedAt" DESC
               LIMIT $4"#,
        )
        .bind(user_id)
        .bind(DocumentDraftType::CoverLetter.as_str())
        .bind(exclude_application_id)
        .bind(limit)
        .fetch_all(&mut *conn)
        .await?;
        to_entities(&rows)
    }
}
