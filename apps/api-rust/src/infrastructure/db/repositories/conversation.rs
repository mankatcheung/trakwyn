use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use crate::domain::conversation::Conversation;
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{ConversationRepository, CreateConversationData};

pub struct PgConversationRepository {
    db: Db,
}

impl PgConversationRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> Result<Conversation, sqlx::Error> {
    Ok(Conversation {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        title: row.try_get("title")?,
        llm_provider: row.try_get("llmProvider")?,
        llm_model: row.try_get("llmModel")?,
        created_at: row.try_get("createdAt")?,
        updated_at: row.try_get("updatedAt")?,
    })
}

fn to_entities(rows: &[PgRow]) -> DomainResult<Vec<Conversation>> {
    Ok(rows.iter().map(to_entity).collect::<Result<_, _>>()?)
}

/// A `LIKE` pattern that finds `term` anywhere, with the wildcards and the
/// escape character inside it escaped, so a search for "50%" finds the
/// literal string. Meaningful only with `ESCAPE '\'`.
fn contains_pattern(term: &str) -> String {
    let mut pattern = String::with_capacity(term.len() + 2);
    pattern.push('%');
    for ch in term.chars() {
        if matches!(ch, '\\' | '%' | '_') {
            pattern.push('\\');
        }
        pattern.push(ch);
    }
    pattern.push('%');
    pattern
}

#[async_trait]
impl ConversationRepository for PgConversationRepository {
    async fn create(&self, data: CreateConversationData) -> DomainResult<Conversation> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "Conversation"
                 ("id", "userId", "llmProvider", "llmModel", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $5)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.user_id)
        .bind(&data.llm_provider)
        .bind(&data.llm_model)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        Ok(to_entity(&row)?)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Conversation>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(r#"SELECT * FROM "Conversation" WHERE "id" = $1"#)
            .bind(id)
            .fetch_optional(&mut *conn)
            .await?;
        Ok(row.as_ref().map(to_entity).transpose()?)
    }

    async fn find_all_by_user_id(
        &self,
        user_id: &str,
        limit: Option<i64>,
    ) -> DomainResult<Vec<Conversation>> {
        let mut conn = self.db.conn().await?;
        // `LIMIT NULL` is no limit. A negative limit is dropped too, as
        // Drizzle drops it, rather than reaching Postgres as an error.
        let rows = sqlx::query(
            r#"SELECT * FROM "Conversation" WHERE "userId" = $1
               ORDER BY "updatedAt" DESC
               LIMIT $2"#,
        )
        .bind(user_id)
        .bind(limit.filter(|limit| *limit >= 0))
        .fetch_all(&mut *conn)
        .await?;
        to_entities(&rows)
    }

    async fn search_by_user_id(
        &self,
        user_id: &str,
        search_term: &str,
    ) -> DomainResult<Vec<Conversation>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT c.* FROM "Conversation" c
               WHERE c."userId" = $1
                 AND (c."title" ILIKE $2 ESCAPE '\'
                      OR EXISTS (
                        SELECT 1 FROM "Message" m
                        WHERE m."conversationId" = c."id" AND m."content" ILIKE $2 ESCAPE '\'
                      ))
               ORDER BY c."updatedAt" DESC"#,
        )
        .bind(user_id)
        .bind(contains_pattern(search_term))
        .fetch_all(&mut *conn)
        .await?;
        to_entities(&rows)
    }

    async fn update_title(&self, id: &str, title: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"UPDATE "Conversation" SET "title" = $2, "updatedAt" = $3 WHERE "id" = $1"#)
            .bind(id)
            .bind(title)
            .bind(now())
            .execute(&mut *conn)
            .await?;
        Ok(())
    }

    async fn update_llm_settings(
        &self,
        id: &str,
        llm_provider: &str,
        llm_model: Option<&str>,
    ) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(
            r#"UPDATE "Conversation"
               SET "llmProvider" = $2, "llmModel" = $3, "updatedAt" = $4
               WHERE "id" = $1"#,
        )
        .bind(id)
        .bind(llm_provider)
        .bind(llm_model)
        .bind(now())
        .execute(&mut *conn)
        .await?;
        Ok(())
    }

    async fn delete(&self, id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"DELETE FROM "Conversation" WHERE "id" = $1"#)
            .bind(id)
            .execute(&mut *conn)
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wraps_a_plain_term_in_wildcards() {
        assert_eq!(contains_pattern("offer"), "%offer%");
    }

    #[test]
    fn escapes_wildcards_and_the_escape_character() {
        assert_eq!(contains_pattern(r"50%_a\b"), r"%50\%\_a\\b%");
    }
}
