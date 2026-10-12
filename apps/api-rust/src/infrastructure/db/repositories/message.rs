use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use super::support::unknown_value;
use crate::domain::message::{Message, MessageRole};
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateMessageData, MessageRepository};

pub struct PgMessageRepository {
    db: Db,
}

impl PgMessageRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> DomainResult<Message> {
    let role: String = row.try_get("role")?;
    Ok(Message {
        id: row.try_get("id")?,
        conversation_id: row.try_get("conversationId")?,
        role: MessageRole::parse(&role).ok_or_else(|| unknown_value("Message", "role", &role))?,
        content: row.try_get("content")?,
        tool_trace: row.try_get("toolTrace")?,
        created_at: row.try_get("createdAt")?,
    })
}

#[async_trait]
impl MessageRepository for PgMessageRepository {
    async fn create(&self, data: CreateMessageData) -> DomainResult<Message> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "Message"
                 ("id", "conversationId", "role", "content", "toolTrace", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.conversation_id)
        .bind(data.role.as_str())
        .bind(&data.content)
        .bind(&data.tool_trace)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        to_entity(&row)
    }

    async fn find_all_by_conversation_id(
        &self,
        conversation_id: &str,
    ) -> DomainResult<Vec<Message>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT * FROM "Message" WHERE "conversationId" = $1 ORDER BY "createdAt" ASC"#,
        )
        .bind(conversation_id)
        .fetch_all(&mut *conn)
        .await?;
        rows.iter().map(to_entity).collect()
    }
}
