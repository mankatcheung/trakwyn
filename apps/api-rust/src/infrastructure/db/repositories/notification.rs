use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::postgres::PgRow;
use sqlx::Row;

use super::support::unknown_value;
use crate::domain::notification::{Notification, NotificationType};
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{
    CreateNotificationData, FindNotificationsPagePagination, NotificationRepository,
    NotificationsPage,
};

pub struct PgNotificationRepository {
    db: Db,
}

impl PgNotificationRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> DomainResult<Notification> {
    let notification_type: String = row.try_get("type")?;
    Ok(Notification {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        notification_type: NotificationType::parse(&notification_type)
            .ok_or_else(|| unknown_value("Notification", "type", &notification_type))?,
        title: row.try_get("title")?,
        body: row.try_get("body")?,
        url: row.try_get("url")?,
        read_at: row.try_get("readAt")?,
        created_at: row.try_get("createdAt")?,
    })
}

#[async_trait]
impl NotificationRepository for PgNotificationRepository {
    async fn create(&self, data: CreateNotificationData) -> DomainResult<Notification> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "Notification" ("id", "userId", "type", "title", "body", "url", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.user_id)
        .bind(data.notification_type.as_str())
        .bind(&data.title)
        .bind(&data.body)
        .bind(&data.url)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        to_entity(&row)
    }

    async fn find_page_by_user_id(
        &self,
        user_id: &str,
        pagination: FindNotificationsPagePagination,
    ) -> DomainResult<NotificationsPage> {
        let FindNotificationsPagePagination { cursor, limit } = pagination;
        let mut conn = self.db.conn().await?;

        // The cursor is looked up by id alone, as `apps/api` does: it only
        // supplies a position in the (createdAt, id) order, and the page
        // itself is still filtered to `user_id`.
        let position: Option<(DateTime<Utc>, String)> = match cursor.filter(|id| !id.is_empty()) {
            Some(cursor) => sqlx::query(
                r#"SELECT "createdAt", "id" FROM "Notification" WHERE "id" = $1 LIMIT 1"#,
            )
            .bind(cursor)
            .fetch_optional(&mut *conn)
            .await?
            .map(|row| Ok::<_, sqlx::Error>((row.try_get("createdAt")?, row.try_get("id")?)))
            .transpose()?,
            None => None,
        };

        // One row past the page says whether another page follows.
        let rows = match position {
            Some((created_at, id)) => {
                sqlx::query(
                    r#"SELECT * FROM "Notification"
                       WHERE "userId" = $1
                         AND ("createdAt" < $2 OR ("createdAt" = $2 AND "id" < $3))
                       ORDER BY "createdAt" DESC, "id" DESC
                       LIMIT $4"#,
                )
                .bind(user_id)
                .bind(created_at)
                .bind(id)
                .bind(limit + 1)
                .fetch_all(&mut *conn)
                .await?
            }
            None => {
                sqlx::query(
                    r#"SELECT * FROM "Notification"
                       WHERE "userId" = $1
                       ORDER BY "createdAt" DESC, "id" DESC
                       LIMIT $2"#,
                )
                .bind(user_id)
                .bind(limit + 1)
                .fetch_all(&mut *conn)
                .await?
            }
        };

        let has_next_page = rows.len() as i64 > limit;
        let items = rows
            .iter()
            .take(limit.max(0) as usize)
            .map(to_entity)
            .collect::<DomainResult<Vec<_>>>()?;
        Ok(NotificationsPage { items, has_next_page })
    }

    async fn mark_many_read_for_user(
        &self,
        user_id: &str,
        ids: &[String],
        is_read: bool,
    ) -> DomainResult<i64> {
        let mut conn = self.db.conn().await?;
        // Rows already in the target state are left out, so the count is the
        // number that actually changed.
        let result = if is_read {
            sqlx::query(
                r#"UPDATE "Notification" SET "readAt" = $3
                   WHERE "userId" = $1 AND "id" = ANY($2) AND "readAt" IS NULL"#,
            )
            .bind(user_id)
            .bind(ids)
            .bind(now())
            .execute(&mut *conn)
            .await?
        } else {
            sqlx::query(
                r#"UPDATE "Notification" SET "readAt" = NULL
                   WHERE "userId" = $1 AND "id" = ANY($2) AND "readAt" IS NOT NULL"#,
            )
            .bind(user_id)
            .bind(ids)
            .execute(&mut *conn)
            .await?
        };
        Ok(result.rows_affected() as i64)
    }

    async fn count_unread_for_user(&self, user_id: &str) -> DomainResult<i64> {
        let mut conn = self.db.conn().await?;
        let count = sqlx::query_scalar(
            r#"SELECT count(*) FROM "Notification" WHERE "userId" = $1 AND "readAt" IS NULL"#,
        )
        .bind(user_id)
        .fetch_one(&mut *conn)
        .await?;
        Ok(count)
    }
}
