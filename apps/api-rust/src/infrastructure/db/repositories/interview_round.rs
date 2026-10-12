use async_trait::async_trait;
use chrono::{DateTime, TimeDelta, Utc};
use sqlx::postgres::PgRow;
use sqlx::{Postgres, QueryBuilder, Row};

use super::support::unknown_value;
use crate::domain::interview_round::{InterviewRound, InterviewRoundOutcome, InterviewRoundType};
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::constants::defaults;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{
    CreateInterviewRoundData, InterviewRoundRepository, UpdateInterviewRoundData,
};

pub struct PgInterviewRoundRepository {
    db: Db,
}

impl PgInterviewRoundRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> DomainResult<InterviewRound> {
    let round_type: String = row.try_get("type")?;
    let outcome: String = row.try_get("outcome")?;
    Ok(InterviewRound {
        id: row.try_get("id")?,
        application_id: row.try_get("applicationId")?,
        r#type: InterviewRoundType::parse(&round_type)
            .ok_or_else(|| unknown_value("InterviewRound", "type", &round_type))?,
        scheduled_at: row.try_get("scheduledAt")?,
        completed_at: row.try_get("completedAt")?,
        interviewer_name: row.try_get("interviewerName")?,
        notes: row.try_get("notes")?,
        outcome: InterviewRoundOutcome::parse(&outcome)
            .ok_or_else(|| unknown_value("InterviewRound", "outcome", &outcome))?,
        push_notification_sent_at: row.try_get("pushNotificationSentAt")?,
        created_at: row.try_get("createdAt")?,
        updated_at: row.try_get("updatedAt")?,
    })
}

fn to_entities(rows: &[PgRow]) -> DomainResult<Vec<InterviewRound>> {
    rows.iter().map(to_entity).collect()
}

#[async_trait]
impl InterviewRoundRepository for PgInterviewRoundRepository {
    async fn find_all_by_application_id(
        &self,
        application_id: &str,
    ) -> DomainResult<Vec<InterviewRound>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT * FROM "InterviewRound" WHERE "applicationId" = $1 ORDER BY "createdAt" ASC"#,
        )
        .bind(application_id)
        .fetch_all(&mut *conn)
        .await?;
        to_entities(&rows)
    }

    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64> {
        let mut conn = self.db.conn().await?;
        let count = sqlx::query_scalar(
            r#"SELECT count(*) FROM "InterviewRound" WHERE "applicationId" = $1"#,
        )
        .bind(application_id)
        .fetch_one(&mut *conn)
        .await?;
        Ok(count)
    }

    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<InterviewRound>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT r.* FROM "InterviewRound" r
               INNER JOIN "JobApplication" a ON r."applicationId" = a."id"
               WHERE a."userId" = $1
               ORDER BY r."createdAt" ASC"#,
        )
        .bind(user_id)
        .fetch_all(&mut *conn)
        .await?;
        to_entities(&rows)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<InterviewRound>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(r#"SELECT * FROM "InterviewRound" WHERE "id" = $1 LIMIT 1"#)
            .bind(id)
            .fetch_optional(&mut *conn)
            .await?;
        row.as_ref().map(to_entity).transpose()
    }

    async fn find_upcoming_within_window(
        &self,
        window_ms: i64,
    ) -> DomainResult<Vec<InterviewRound>> {
        let now = now();
        let cutoff = now + TimeDelta::milliseconds(window_ms);
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT * FROM "InterviewRound"
               WHERE "scheduledAt" > $1
                 AND "scheduledAt" <= $2
                 AND "completedAt" IS NULL
                 AND "pushNotificationSentAt" IS NULL
               ORDER BY "scheduledAt" ASC"#,
        )
        .bind(now)
        .bind(cutoff)
        .fetch_all(&mut *conn)
        .await?;
        to_entities(&rows)
    }

    async fn create(&self, data: CreateInterviewRoundData) -> DomainResult<InterviewRound> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "InterviewRound"
                 ("id", "applicationId", "type", "scheduledAt", "completedAt", "interviewerName",
                  "notes", "outcome", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.application_id)
        .bind(data.r#type.as_str())
        .bind(data.scheduled_at)
        .bind(data.completed_at)
        .bind(&data.interviewer_name)
        .bind(&data.notes)
        .bind(data.outcome.unwrap_or(defaults::INTERVIEW_OUTCOME).as_str())
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        to_entity(&row)
    }

    async fn update(
        &self,
        id: &str,
        data: UpdateInterviewRoundData,
    ) -> DomainResult<InterviewRound> {
        let mut query =
            QueryBuilder::<Postgres>::new(r#"UPDATE "InterviewRound" SET "updatedAt" = "#);
        query.push_bind(now());
        if let Some(round_type) = data.r#type {
            query.push(r#", "type" = "#).push_bind(round_type.as_str());
        }
        if let Some(scheduled_at) = data.scheduled_at {
            query.push(r#", "scheduledAt" = "#).push_bind(scheduled_at);
        }
        if let Some(completed_at) = data.completed_at {
            query.push(r#", "completedAt" = "#).push_bind(completed_at);
        }
        if let Some(interviewer_name) = data.interviewer_name {
            query.push(r#", "interviewerName" = "#).push_bind(interviewer_name);
        }
        if let Some(notes) = data.notes {
            query.push(r#", "notes" = "#).push_bind(notes);
        }
        if let Some(outcome) = data.outcome {
            query.push(r#", "outcome" = "#).push_bind(outcome.as_str());
        }
        query.push(r#" WHERE "id" = "#).push_bind(id).push(" RETURNING *");

        let mut conn = self.db.conn().await?;
        let row = query.build().fetch_one(&mut *conn).await?;
        to_entity(&row)
    }

    async fn update_push_notification_sent_at(
        &self,
        id: &str,
        sent_at: DateTime<Utc>,
    ) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(
            r#"UPDATE "InterviewRound"
               SET "pushNotificationSentAt" = $2, "updatedAt" = $3
               WHERE "id" = $1"#,
        )
        .bind(id)
        .bind(sent_at)
        .bind(now())
        .execute(&mut *conn)
        .await?;
        Ok(())
    }

    async fn delete(&self, id: &str, _application_id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"DELETE FROM "InterviewRound" WHERE "id" = $1"#)
            .bind(id)
            .execute(&mut *conn)
            .await?;
        Ok(())
    }
}
