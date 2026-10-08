use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::postgres::PgRow;
use sqlx::{Encode, Postgres, QueryBuilder, Row, Type};

use super::support::unknown_value;
use crate::domain::user::{DigestFrequency, User};
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateUserData, UpdateUserData, UserRepository};

pub struct PgUserRepository {
    db: Db,
}

impl PgUserRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> DomainResult<User> {
    let digest_frequency: String = row.try_get("digestFrequency")?;
    Ok(User {
        id: row.try_get("id")?,
        email: row.try_get("email")?,
        password_hash: row.try_get("passwordHash")?,
        name: row.try_get("name")?,
        timezone: row.try_get("timezone")?,
        target_role: row.try_get("targetRole")?,
        email_verified_at: row.try_get("emailVerifiedAt")?,
        avatar_key: row.try_get("avatarKey")?,
        weekly_digest_enabled: row.try_get("weeklyDigestEnabled")?,
        digest_frequency: DigestFrequency::parse(&digest_frequency)
            .ok_or_else(|| unknown_value("User", "digestFrequency", &digest_frequency))?,
        last_digest_sent_at: row.try_get("lastDigestSentAt")?,
        follow_up_reminders_enabled: row.try_get("followUpRemindersEnabled")?,
        push_notifications_enabled: row.try_get("pushNotificationsEnabled")?,
        weekly_application_goal: row.try_get("weeklyApplicationGoal")?,
        totp_secret: row.try_get("totpSecret")?,
        totp_enabled: row.try_get("totpEnabled")?,
        default_llm_provider: row.try_get("defaultLlmProvider")?,
        custom_ai_prompt: row.try_get("customAiPrompt")?,
        use_cross_application_context: row.try_get("useCrossApplicationContext")?,
        llm_fallback_when_limited: row.try_get("llmFallbackWhenLimited")?,
        backup_email: row.try_get("backupEmail")?,
        backup_email_verified_at: row.try_get("backupEmailVerifiedAt")?,
        onboarding_checklist_dismissed_at: row.try_get("onboardingChecklistDismissedAt")?,
        created_at: row.try_get("createdAt")?,
        updated_at: row.try_get("updatedAt")?,
    })
}

/// Appends `, "<column>" = <value>` when the update names the field.
fn set<'args, T>(query: &mut QueryBuilder<'args, Postgres>, column: &str, value: Option<T>)
where
    T: 'args + Encode<'args, Postgres> + Type<Postgres>,
{
    if let Some(value) = value {
        query.push(format!(r#", "{column}" = "#));
        query.push_bind(value);
    }
}

/// `updatedAt` is always written (Drizzle's `$onUpdate`), so the statement is
/// valid even when `data` names no field.
fn update_statement(id: &str, data: UpdateUserData) -> QueryBuilder<'_, Postgres> {
    let mut query = QueryBuilder::new(r#"UPDATE "User" SET "updatedAt" = "#);
    query.push_bind(now());
    set(&mut query, "email", data.email);
    set(&mut query, "passwordHash", data.password_hash);
    set(&mut query, "name", data.name);
    set(&mut query, "timezone", data.timezone);
    set(&mut query, "targetRole", data.target_role);
    set(&mut query, "emailVerifiedAt", data.email_verified_at);
    set(&mut query, "avatarKey", data.avatar_key);
    set(&mut query, "weeklyDigestEnabled", data.weekly_digest_enabled);
    set(&mut query, "digestFrequency", data.digest_frequency.map(DigestFrequency::as_str));
    set(&mut query, "followUpRemindersEnabled", data.follow_up_reminders_enabled);
    set(&mut query, "pushNotificationsEnabled", data.push_notifications_enabled);
    set(&mut query, "weeklyApplicationGoal", data.weekly_application_goal);
    set(&mut query, "totpSecret", data.totp_secret);
    set(&mut query, "totpEnabled", data.totp_enabled);
    set(&mut query, "defaultLlmProvider", data.default_llm_provider);
    set(&mut query, "customAiPrompt", data.custom_ai_prompt);
    set(&mut query, "useCrossApplicationContext", data.use_cross_application_context);
    set(&mut query, "llmFallbackWhenLimited", data.llm_fallback_when_limited);
    set(&mut query, "backupEmail", data.backup_email);
    set(&mut query, "backupEmailVerifiedAt", data.backup_email_verified_at);
    set(&mut query, "onboardingChecklistDismissedAt", data.onboarding_checklist_dismissed_at);
    query.push(r#" WHERE "id" = "#);
    query.push_bind(id);
    query.push(" RETURNING *");
    query
}

impl PgUserRepository {
    async fn find_one_by(&self, column: &str, value: &str) -> DomainResult<Option<User>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(&format!(r#"SELECT * FROM "User" WHERE "{column}" = $1 LIMIT 1"#))
            .bind(value)
            .fetch_optional(&mut *conn)
            .await?;
        row.as_ref().map(to_entity).transpose()
    }
}

#[async_trait]
impl UserRepository for PgUserRepository {
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<User>> {
        self.find_one_by("id", id).await
    }

    async fn find_by_email(&self, email: &str) -> DomainResult<Option<User>> {
        self.find_one_by("email", email).await
    }

    async fn find_by_backup_email(&self, email: &str) -> DomainResult<Option<User>> {
        self.find_one_by("backupEmail", email).await
    }

    async fn find_all(&self) -> DomainResult<Vec<User>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(r#"SELECT * FROM "User" ORDER BY "createdAt" ASC"#)
            .fetch_all(&mut *conn)
            .await?;
        rows.iter().map(to_entity).collect()
    }

    async fn create(&self, data: CreateUserData) -> DomainResult<User> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "User"
                 ("id", "email", "passwordHash", "name", "emailVerifiedAt", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $6)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.email)
        .bind(&data.password_hash)
        .bind(&data.name)
        .bind(data.email_verified_at)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        to_entity(&row)
    }

    async fn update(&self, id: &str, data: UpdateUserData) -> DomainResult<User> {
        let mut conn = self.db.conn().await?;
        let mut statement = update_statement(id, data);
        let row = statement.build().fetch_one(&mut *conn).await?;
        to_entity(&row)
    }

    async fn delete(&self, id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"DELETE FROM "User" WHERE "id" = $1"#).bind(id).execute(&mut *conn).await?;
        Ok(())
    }

    async fn update_last_digest_sent_at(
        &self,
        id: &str,
        sent_at: DateTime<Utc>,
    ) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        // `updatedAt` moves too: Drizzle's `$onUpdate` fires on every update
        // of the row, not only on `update()`.
        sqlx::query(
            r#"UPDATE "User" SET "lastDigestSentAt" = $2, "updatedAt" = $3 WHERE "id" = $1"#,
        )
        .bind(id)
        .bind(sent_at)
        .bind(now())
        .execute(&mut *conn)
        .await?;
        Ok(())
    }
}
