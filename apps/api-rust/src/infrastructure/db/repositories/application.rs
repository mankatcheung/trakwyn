use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use super::support::unknown_value;
use crate::domain::application::{Application, ApplicationStatus};
use crate::infrastructure::db::Db;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::ApplicationRepository;

pub struct PgApplicationRepository {
    db: Db,
}

impl PgApplicationRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow, tags: Vec<String>) -> DomainResult<Application> {
    let status: String = row.try_get("status")?;
    Ok(Application {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        company: row.try_get("company")?,
        role: row.try_get("role")?,
        status: ApplicationStatus::parse(&status)
            .ok_or_else(|| unknown_value("JobApplication", "status", &status))?,
        job_url: row.try_get("jobUrl")?,
        location: row.try_get("location")?,
        salary_range: row.try_get("salaryRange")?,
        description: row.try_get("description")?,
        applied_at: row.try_get("appliedAt")?,
        starred: row.try_get("starred")?,
        source: row.try_get("source")?,
        follow_up_at: row.try_get("followUpAt")?,
        tags,
        reminder_sent_at: row.try_get("reminderSentAt")?,
        board_position: row.try_get("boardPosition")?,
        deleted_at: row.try_get("deletedAt")?,
        created_at: row.try_get("createdAt")?,
        updated_at: row.try_get("updatedAt")?,
    })
}

#[async_trait]
impl ApplicationRepository for PgApplicationRepository {
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Application>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"SELECT * FROM "JobApplication" WHERE "id" = $1 AND "deletedAt" IS NULL LIMIT 1"#,
        )
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?;
        let Some(row) = row else { return Ok(None) };

        let tags: Vec<String> =
            sqlx::query_scalar(r#"SELECT "name" FROM "ApplicationTag" WHERE "applicationId" = $1"#)
                .bind(id)
                .fetch_all(&mut *conn)
                .await?;
        to_entity(&row, tags).map(Some)
    }
}
