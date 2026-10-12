use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use crate::domain::company_briefing::CompanyBriefing;
use crate::infrastructure::db::Db;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CompanyBriefingRepository, UpsertCompanyBriefingData};

pub struct PgCompanyBriefingRepository {
    db: Db,
}

impl PgCompanyBriefingRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> Result<CompanyBriefing, sqlx::Error> {
    Ok(CompanyBriefing {
        id: row.try_get("id")?,
        application_id: row.try_get("applicationId")?,
        content: row.try_get("content")?,
        generated_at: row.try_get("generatedAt")?,
    })
}

#[async_trait]
impl CompanyBriefingRepository for PgCompanyBriefingRepository {
    async fn find_by_application_id(
        &self,
        application_id: &str,
    ) -> DomainResult<Option<CompanyBriefing>> {
        let mut conn = self.db.conn().await?;
        let row =
            sqlx::query(r#"SELECT * FROM "CompanyBriefing" WHERE "applicationId" = $1 LIMIT 1"#)
                .bind(application_id)
                .fetch_optional(&mut *conn)
                .await?;
        Ok(row.as_ref().map(to_entity).transpose()?)
    }

    async fn upsert(&self, data: UpsertCompanyBriefingData) -> DomainResult<CompanyBriefing> {
        // Conflict target is applicationId, not id: a regenerate arrives with
        // a fresh id and must replace the existing row rather than collide
        // with it. The existing row keeps its id.
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "CompanyBriefing" ("id", "applicationId", "content", "generatedAt")
               VALUES ($1, $2, $3, $4)
               ON CONFLICT ("applicationId")
               DO UPDATE SET "content" = EXCLUDED."content", "generatedAt" = EXCLUDED."generatedAt"
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.application_id)
        .bind(&data.content)
        .bind(data.generated_at)
        .fetch_one(&mut *conn)
        .await?;
        Ok(to_entity(&row)?)
    }
}
