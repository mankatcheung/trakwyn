use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use super::support::unknown_value;
use crate::domain::activity_log::{ActivityEventType, ActivityLog};
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{ActivityLogRepository, AppendActivityLogData};

pub struct PgActivityLogRepository {
    db: Db,
}

impl PgActivityLogRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> DomainResult<ActivityLog> {
    let event_type: String = row.try_get("eventType")?;
    Ok(ActivityLog {
        id: row.try_get("id")?,
        application_id: row.try_get("applicationId")?,
        actor_id: row.try_get("actorId")?,
        event_type: ActivityEventType::parse(&event_type)
            .ok_or_else(|| unknown_value("ActivityLog", "eventType", &event_type))?,
        payload: row.try_get("payload")?,
        created_at: row.try_get("createdAt")?,
    })
}

#[async_trait]
impl ActivityLogRepository for PgActivityLogRepository {
    async fn find_all_by_application_id(
        &self,
        application_id: &str,
    ) -> DomainResult<Vec<ActivityLog>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT * FROM "ActivityLog" WHERE "applicationId" = $1 ORDER BY "createdAt" DESC"#,
        )
        .bind(application_id)
        .fetch_all(&mut *conn)
        .await?;
        rows.iter().map(to_entity).collect()
    }

    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<ActivityLog>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT l.* FROM "ActivityLog" l
               INNER JOIN "JobApplication" a ON l."applicationId" = a."id"
               WHERE a."userId" = $1
               ORDER BY l."createdAt" ASC"#,
        )
        .bind(user_id)
        .fetch_all(&mut *conn)
        .await?;
        rows.iter().map(to_entity).collect()
    }

    async fn append(&self, data: AppendActivityLogData) -> DomainResult<ActivityLog> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "ActivityLog"
                 ("id", "applicationId", "actorId", "eventType", "payload", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.application_id)
        .bind(&data.actor_id)
        .bind(data.event_type.as_str())
        .bind(&data.payload)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        to_entity(&row)
    }
}
