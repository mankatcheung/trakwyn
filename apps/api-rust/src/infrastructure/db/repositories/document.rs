use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use crate::domain::document::Document;
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::constants::document_limits::{
    DEFAULT_DOCUMENT_TYPE, DOCUMENTS_PER_APPLICATION,
};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{CreateDocumentData, DocumentRepository};

pub struct PgDocumentRepository {
    db: Db,
}

impl PgDocumentRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> Result<Document, sqlx::Error> {
    Ok(Document {
        id: row.try_get("id")?,
        application_id: row.try_get("applicationId")?,
        name: row.try_get("name")?,
        mime_type: row.try_get("mimeType")?,
        size_bytes: row.try_get("sizeBytes")?,
        storage_key: row.try_get("storageKey")?,
        document_type: row.try_get("documentType")?,
        version: row.try_get("version")?,
        source_draft_id: row.try_get("sourceDraftId")?,
        created_at: row.try_get("createdAt")?,
    })
}

fn to_entities(rows: &[PgRow]) -> DomainResult<Vec<Document>> {
    Ok(rows.iter().map(to_entity).collect::<Result<_, _>>()?)
}

#[async_trait]
impl DocumentRepository for PgDocumentRepository {
    async fn find_all_by_application_id(
        &self,
        application_id: &str,
    ) -> DomainResult<Vec<Document>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT * FROM "Document" WHERE "applicationId" = $1 ORDER BY "createdAt" DESC"#,
        )
        .bind(application_id)
        .fetch_all(&mut *conn)
        .await?;
        to_entities(&rows)
    }

    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64> {
        let mut conn = self.db.conn().await?;
        let count =
            sqlx::query_scalar(r#"SELECT count(*) FROM "Document" WHERE "applicationId" = $1"#)
                .bind(application_id)
                .fetch_one(&mut *conn)
                .await?;
        Ok(count)
    }

    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Document>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT d.* FROM "Document" d
               INNER JOIN "JobApplication" a ON d."applicationId" = a."id"
               WHERE a."userId" = $1
               ORDER BY d."createdAt" DESC"#,
        )
        .bind(user_id)
        .fetch_all(&mut *conn)
        .await?;
        to_entities(&rows)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Document>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(r#"SELECT * FROM "Document" WHERE "id" = $1 LIMIT 1"#)
            .bind(id)
            .fetch_optional(&mut *conn)
            .await?;
        Ok(row.as_ref().map(to_entity).transpose()?)
    }

    async fn create(&self, data: CreateDocumentData) -> DomainResult<Document> {
        self.db
            .transaction(|| async {
                let mut conn = self.db.conn().await?;

                // Reserve the quota slot first: the conditional update is the
                // check, so two concurrent uploads cannot both take the last one.
                let reserved = sqlx::query(
                    r#"UPDATE "JobApplication" SET "documentCount" = "documentCount" + 1
                       WHERE "id" = $1 AND "documentCount" < $2
                       RETURNING "id""#,
                )
                .bind(&data.application_id)
                .bind(DOCUMENTS_PER_APPLICATION)
                .fetch_optional(&mut *conn)
                .await?;
                if reserved.is_none() {
                    return Err(DomainError::quota_exceeded(format!(
                        "This application already has the maximum of {DOCUMENTS_PER_APPLICATION} documents"
                    )));
                }

                let row = sqlx::query(
                    r#"INSERT INTO "Document"
                         ("id", "applicationId", "name", "mimeType", "sizeBytes", "storageKey",
                          "documentType", "version", "sourceDraftId", "createdAt")
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                       RETURNING *"#,
                )
                .bind(&data.id)
                .bind(&data.application_id)
                .bind(&data.name)
                .bind(&data.mime_type)
                .bind(data.size_bytes)
                .bind(&data.storage_key)
                .bind(data.document_type.as_deref().unwrap_or(DEFAULT_DOCUMENT_TYPE))
                .bind(&data.version)
                .bind(&data.source_draft_id)
                .bind(now())
                .fetch_one(&mut *conn)
                .await?;
                Ok(to_entity(&row)?)
            })
            .await
    }

    async fn delete(&self, id: &str, _application_id: &str) -> DomainResult<()> {
        self.db
            .transaction(|| async {
                let mut conn = self.db.conn().await?;
                let deleted: Option<String> = sqlx::query_scalar(
                    r#"DELETE FROM "Document" WHERE "id" = $1 RETURNING "applicationId""#,
                )
                .bind(id)
                .fetch_optional(&mut *conn)
                .await?;
                let Some(application_id) = deleted else {
                    return Ok(());
                };

                sqlx::query(
                    r#"UPDATE "JobApplication"
                       SET "documentCount" =
                         CASE WHEN "documentCount" > 0 THEN "documentCount" - 1 ELSE 0 END
                       WHERE "id" = $1"#,
                )
                .bind(&application_id)
                .execute(&mut *conn)
                .await?;
                Ok(())
            })
            .await
    }
}
