use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use super::support::unknown_value;
use crate::domain::security_event::{SecurityEvent, SecurityEventType};
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateSecurityEventData, SecurityEventRepository};

pub struct PgSecurityEventRepository {
    db: Db,
}

impl PgSecurityEventRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> DomainResult<SecurityEvent> {
    let event_type: String = row.try_get("eventType")?;
    Ok(SecurityEvent {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        event_type: SecurityEventType::parse(&event_type)
            .ok_or_else(|| unknown_value("SecurityEvent", "eventType", &event_type))?,
        ip_address: row.try_get("ipAddress")?,
        user_agent: row.try_get("userAgent")?,
        created_at: row.try_get("createdAt")?,
    })
}

#[async_trait]
impl SecurityEventRepository for PgSecurityEventRepository {
    async fn create(&self, data: CreateSecurityEventData) -> DomainResult<SecurityEvent> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "SecurityEvent"
                 ("id", "userId", "eventType", "ipAddress", "userAgent", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.user_id)
        .bind(data.event_type.as_str())
        .bind(&data.ip_address)
        .bind(&data.user_agent)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        to_entity(&row)
    }

    async fn find_recent_by_user_id(
        &self,
        user_id: &str,
        limit: i64,
    ) -> DomainResult<Vec<SecurityEvent>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT * FROM "SecurityEvent"
               WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT $2"#,
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(&mut *conn)
        .await?;
        rows.iter().map(to_entity).collect()
    }
}
