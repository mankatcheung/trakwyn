use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use crate::domain::login_event::LoginEvent;
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateLoginEventData, LoginEventRepository};

pub struct PgLoginEventRepository {
    db: Db,
}

impl PgLoginEventRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> Result<LoginEvent, sqlx::Error> {
    Ok(LoginEvent {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        ip_address: row.try_get("ipAddress")?,
        user_agent: row.try_get("userAgent")?,
        created_at: row.try_get("createdAt")?,
    })
}

#[async_trait]
impl LoginEventRepository for PgLoginEventRepository {
    async fn create(&self, data: CreateLoginEventData) -> DomainResult<LoginEvent> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "LoginEvent" ("id", "userId", "ipAddress", "userAgent", "createdAt")
               VALUES ($1, $2, $3, $4, $5)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.user_id)
        .bind(&data.ip_address)
        .bind(&data.user_agent)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        Ok(to_entity(&row)?)
    }

    async fn find_recent_by_user_id(
        &self,
        user_id: &str,
        limit: i64,
    ) -> DomainResult<Vec<LoginEvent>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT * FROM "LoginEvent" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT $2"#,
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(&mut *conn)
        .await?;
        Ok(rows.iter().map(to_entity).collect::<Result<_, _>>()?)
    }
}
