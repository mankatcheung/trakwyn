use std::collections::HashMap;

use async_trait::async_trait;
use chrono::{DateTime, TimeDelta, Utc};
use sqlx::postgres::{PgConnection, PgRow};
use sqlx::{Postgres, QueryBuilder, Row};

use super::support::unknown_value;
use crate::domain::application::{Application, ApplicationStatus};
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::constants::{content_limits, reminder_window_ms};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::jobs::application_staleness::likely_ghosted_cutoff;
use crate::use_cases::ports::{
    ApplicationRepository, ApplicationTagData, ApplicationsPage, CreateApplicationData,
    FindApplicationsFilters, FindApplicationsPageFilters, FindApplicationsPagePagination,
    UpdateApplicationData,
};

/// Newest first; the id breaks ties so a page boundary never splits or
/// repeats rows that share a `createdAt`.
const NEWEST_FIRST: &str = r#" ORDER BY "createdAt" DESC, "id" DESC"#;

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

/// Turns application rows into entities, reading all their tags in one query.
async fn attach_tags(conn: &mut PgConnection, rows: &[PgRow]) -> DomainResult<Vec<Application>> {
    if rows.is_empty() {
        return Ok(Vec::new());
    }
    let ids = rows.iter().map(|row| row.try_get("id")).collect::<Result<Vec<String>, _>>()?;
    let tag_rows = sqlx::query(
        r#"SELECT "applicationId", "name" FROM "ApplicationTag" WHERE "applicationId" = ANY($1)"#,
    )
    .bind(&ids)
    .fetch_all(&mut *conn)
    .await?;

    let mut by_application: HashMap<String, Vec<String>> = HashMap::new();
    for tag in &tag_rows {
        by_application.entry(tag.try_get("applicationId")?).or_default().push(tag.try_get("name")?);
    }
    rows.iter()
        .zip(ids)
        .map(|(row, id)| to_entity(row, by_application.remove(&id).unwrap_or_default()))
        .collect()
}

async fn attach_tags_to_one(
    conn: &mut PgConnection,
    row: Option<PgRow>,
) -> DomainResult<Option<Application>> {
    let Some(row) = row else { return Ok(None) };
    Ok(attach_tags(conn, std::slice::from_ref(&row)).await?.pop())
}

async fn insert_tags(
    conn: &mut PgConnection,
    application_id: &str,
    tags: &[ApplicationTagData],
) -> DomainResult<()> {
    if tags.is_empty() {
        return Ok(());
    }
    let ids: Vec<&str> = tags.iter().map(|tag| tag.id.as_str()).collect();
    let names: Vec<&str> = tags.iter().map(|tag| tag.name.as_str()).collect();
    sqlx::query(
        r#"INSERT INTO "ApplicationTag" ("id", "applicationId", "name")
           SELECT tag."id", $1, tag."name"
           FROM UNNEST($2::text[], $3::text[]) AS tag("id", "name")"#,
    )
    .bind(application_id)
    .bind(&ids)
    .bind(&names)
    .execute(&mut *conn)
    .await?;
    Ok(())
}

fn tag_names(tags: &[ApplicationTagData]) -> Vec<String> {
    tags.iter().map(|tag| tag.name.clone()).collect()
}

/// `UPDATE … SET` for the fields `data` names. `updatedAt` is always written,
/// so an update that names no scalar field (a tags-only one) is still a valid
/// statement and still counts as a touch.
fn update_statement<'a>(
    id: &'a str,
    data: &'a UpdateApplicationData,
) -> QueryBuilder<'a, Postgres> {
    let mut query = QueryBuilder::new(r#"UPDATE "JobApplication" SET "updatedAt" = "#);
    query.push_bind(now());
    if let Some(company) = &data.company {
        query.push(r#", "company" = "#).push_bind(company);
    }
    if let Some(role) = &data.role {
        query.push(r#", "role" = "#).push_bind(role);
    }
    if let Some(status) = data.status {
        query.push(r#", "status" = "#).push_bind(status.as_str());
    }
    if let Some(job_url) = &data.job_url {
        query.push(r#", "jobUrl" = "#).push_bind(job_url);
    }
    if let Some(location) = &data.location {
        query.push(r#", "location" = "#).push_bind(location);
    }
    if let Some(salary_range) = &data.salary_range {
        query.push(r#", "salaryRange" = "#).push_bind(salary_range);
    }
    if let Some(description) = &data.description {
        query.push(r#", "description" = "#).push_bind(description);
    }
    if let Some(applied_at) = data.applied_at {
        query.push(r#", "appliedAt" = "#).push_bind(applied_at);
    }
    if let Some(starred) = data.starred {
        query.push(r#", "starred" = "#).push_bind(starred);
    }
    if let Some(source) = &data.source {
        query.push(r#", "source" = "#).push_bind(source);
    }
    if let Some(follow_up_at) = data.follow_up_at {
        query.push(r#", "followUpAt" = "#).push_bind(follow_up_at);
    }
    if let Some(board_position) = data.board_position {
        query.push(r#", "boardPosition" = "#).push_bind(board_position);
    }
    query.push(r#" WHERE "id" = "#).push_bind(id).push(" RETURNING *");
    query
}

impl PgApplicationRepository {
    async fn find_one(&self, sql: &str, id: &str) -> DomainResult<Option<Application>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(sql).bind(id).fetch_optional(&mut *conn).await?;
        attach_tags_to_one(&mut conn, row).await
    }

    /// Must run inside a transaction: the quota reservation and the insert
    /// stand or fall together.
    async fn create_reserving_quota(
        &self,
        data: &CreateApplicationData,
    ) -> DomainResult<Application> {
        let mut conn = self.db.conn().await?;
        let timestamp = now();

        let reserved = sqlx::query(
            r#"UPDATE "User"
               SET "applicationCount" = "applicationCount" + 1, "updatedAt" = $2
               WHERE "id" = $1 AND "applicationCount" < $3
               RETURNING "id""#,
        )
        .bind(&data.user_id)
        .bind(timestamp)
        .bind(content_limits::APPLICATIONS_PER_USER)
        .fetch_optional(&mut *conn)
        .await?;
        if reserved.is_none() {
            return Err(DomainError::quota_exceeded(format!(
                "You have reached the maximum of {} applications",
                content_limits::APPLICATIONS_PER_USER
            )));
        }

        let row = sqlx::query(
            r#"INSERT INTO "JobApplication"
                 ("id", "userId", "company", "role", "status", "jobUrl", "location", "salaryRange",
                  "description", "starred", "source", "followUpAt", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.user_id)
        .bind(&data.company)
        .bind(&data.role)
        .bind(data.status.as_str())
        .bind(&data.job_url)
        .bind(&data.location)
        .bind(&data.salary_range)
        .bind(&data.description)
        .bind(data.starred.unwrap_or(false))
        .bind(&data.source)
        .bind(data.follow_up_at)
        .bind(timestamp)
        .fetch_one(&mut *conn)
        .await?;
        insert_tags(&mut conn, &data.id, &data.tags).await?;
        to_entity(&row, tag_names(&data.tags))
    }

    /// Must run inside a transaction: the row and its tag set change together.
    async fn update_replacing_tags(
        &self,
        id: &str,
        data: &UpdateApplicationData,
        tags: &[ApplicationTagData],
    ) -> DomainResult<Application> {
        let mut conn = self.db.conn().await?;
        let row = update_statement(id, data).build().fetch_one(&mut *conn).await?;
        sqlx::query(r#"DELETE FROM "ApplicationTag" WHERE "applicationId" = $1"#)
            .bind(id)
            .execute(&mut *conn)
            .await?;
        insert_tags(&mut conn, id, tags).await?;
        to_entity(&row, tag_names(tags))
    }

    /// Must run inside a transaction: the row and its quota slot go together.
    async fn delete_releasing_quota(&self, id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        let deleted =
            sqlx::query(r#"DELETE FROM "JobApplication" WHERE "id" = $1 RETURNING "userId""#)
                .bind(id)
                .fetch_optional(&mut *conn)
                .await?;
        let Some(deleted) = deleted else { return Ok(()) };
        let user_id: String = deleted.try_get("userId")?;

        sqlx::query(
            r#"UPDATE "User"
               SET "applicationCount" =
                     CASE WHEN "applicationCount" > 0 THEN "applicationCount" - 1 ELSE 0 END,
                   "updatedAt" = $2
               WHERE "id" = $1"#,
        )
        .bind(user_id)
        .bind(now())
        .execute(&mut *conn)
        .await?;
        Ok(())
    }
}

#[async_trait]
impl ApplicationRepository for PgApplicationRepository {
    async fn find_all_by_user_id(
        &self,
        user_id: &str,
        filters: FindApplicationsFilters,
    ) -> DomainResult<Vec<Application>> {
        let mut conn = self.db.conn().await?;
        let mut query = QueryBuilder::<Postgres>::new(
            r#"SELECT * FROM "JobApplication" WHERE "deletedAt" IS NULL AND "userId" = "#,
        );
        query.push_bind(user_id);
        if let Some(status) = filters.status {
            query.push(r#" AND "status" = "#).push_bind(status.as_str());
        }
        query.push(NEWEST_FIRST);
        let rows = query.build().fetch_all(&mut *conn).await?;
        attach_tags(&mut conn, &rows).await
    }

    async fn find_page_by_user_id(
        &self,
        user_id: &str,
        filters: FindApplicationsPageFilters,
        pagination: FindApplicationsPagePagination,
    ) -> DomainResult<ApplicationsPage> {
        let search = filters.search.as_deref().map(str::trim).filter(|search| !search.is_empty());
        let FindApplicationsPagePagination { cursor, limit } = pagination;
        let mut conn = self.db.conn().await?;

        let mut query = QueryBuilder::<Postgres>::new(
            r#"SELECT * FROM "JobApplication" WHERE "deletedAt" IS NULL AND "userId" = "#,
        );
        query.push_bind(user_id);
        if let Some(status) = filters.status {
            query.push(r#" AND "status" = "#).push_bind(status.as_str());
        }
        if filters.starred == Some(true) {
            query.push(r#" AND "starred" = true"#);
        }
        if filters.likely_ghosted == Some(true) {
            let cutoff = likely_ghosted_cutoff(now());
            query
                .push(r#" AND "status" IN ('applied', 'interviewing') AND "appliedAt" IS NOT NULL"#)
                .push(r#" AND "updatedAt" <= "#)
                .push_bind(cutoff)
                .push(r#" AND ("reminderSentAt" IS NULL OR "reminderSentAt" <= "#)
                .push_bind(cutoff)
                .push(")");
        }
        if let Some(search) = search {
            // ILIKE, not LIKE: the search box has always been case-insensitive.
            let pattern = format!("%{search}%");
            query
                .push(r#" AND ("company" ILIKE "#)
                .push_bind(pattern.clone())
                .push(r#" OR "role" ILIKE "#)
                .push_bind(pattern.clone())
                .push(r#" OR "location" ILIKE "#)
                .push_bind(pattern.clone())
                .push(r#" OR "description" ILIKE "#)
                .push_bind(pattern)
                .push(")");
        }

        if let Some(cursor) = cursor.filter(|cursor| !cursor.is_empty()) {
            let cursor_row = sqlx::query(
                r#"SELECT "createdAt", "id" FROM "JobApplication" WHERE "id" = $1 LIMIT 1"#,
            )
            .bind(&cursor)
            .fetch_optional(&mut *conn)
            .await?;
            // An unknown cursor constrains nothing: the page starts from the top.
            if let Some(cursor_row) = cursor_row {
                let created_at: DateTime<Utc> = cursor_row.try_get("createdAt")?;
                let id: String = cursor_row.try_get("id")?;
                query
                    .push(r#" AND ("createdAt" < "#)
                    .push_bind(created_at)
                    .push(r#" OR ("createdAt" = "#)
                    .push_bind(created_at)
                    .push(r#" AND "id" < "#)
                    .push_bind(id)
                    .push("))");
            }
        }

        // One past the limit, to learn whether there is a next page.
        query.push(NEWEST_FIRST).push(" LIMIT ").push_bind(limit + 1);
        let mut rows = query.build().fetch_all(&mut *conn).await?;

        let has_next_page = rows.len() as i64 > limit;
        if has_next_page {
            rows.truncate(usize::try_from(limit).unwrap_or(0));
        }
        let items = attach_tags(&mut conn, &rows).await?;
        Ok(ApplicationsPage { items, has_next_page })
    }

    /// Live applications only. Trashed ones read as missing, which is what
    /// makes every use case that gates on this refuse to act on one without
    /// any of them having to know Trash exists.
    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Application>> {
        self.find_one(
            r#"SELECT * FROM "JobApplication" WHERE "id" = $1 AND "deletedAt" IS NULL LIMIT 1"#,
            id,
        )
        .await
    }

    /// The deliberate exception, for the two callers that must see a trashed
    /// application: the detail query, so a link from an old email lands on a
    /// read-only view with a Restore banner rather than a 404, and the Trash
    /// operations themselves.
    async fn find_by_id_including_trashed(&self, id: &str) -> DomainResult<Option<Application>> {
        self.find_one(r#"SELECT * FROM "JobApplication" WHERE "id" = $1 LIMIT 1"#, id).await
    }

    async fn find_trashed_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Application>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT * FROM "JobApplication"
               WHERE "userId" = $1 AND "deletedAt" IS NOT NULL
               ORDER BY "deletedAt" DESC, "id" DESC"#,
        )
        .bind(user_id)
        .fetch_all(&mut *conn)
        .await?;
        attach_tags(&mut conn, &rows).await
    }

    /// Trashed longer than the retention window, so the purge job can finish
    /// the job.
    async fn find_due_for_purge(
        &self,
        deleted_before: DateTime<Utc>,
    ) -> DomainResult<Vec<Application>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT * FROM "JobApplication"
               WHERE "deletedAt" IS NOT NULL AND "deletedAt" <= $1"#,
        )
        .bind(deleted_before)
        .fetch_all(&mut *conn)
        .await?;
        attach_tags(&mut conn, &rows).await
    }

    // `updatedAt` moves on the three single-column writes below because
    // Drizzle's `$onUpdate` fills it in on every UPDATE that does not name it.

    async fn soft_delete(&self, id: &str, deleted_at: DateTime<Utc>) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(
            r#"UPDATE "JobApplication" SET "deletedAt" = $2, "updatedAt" = $3 WHERE "id" = $1"#,
        )
        .bind(id)
        .bind(deleted_at)
        .bind(now())
        .execute(&mut *conn)
        .await?;
        Ok(())
    }

    async fn restore(&self, id: &str) -> DomainResult<()> {
        // One statement, because the children were never touched: they are
        // hidden by their parent being hidden, not by anything having happened
        // to them.
        let mut conn = self.db.conn().await?;
        sqlx::query(
            r#"UPDATE "JobApplication" SET "deletedAt" = NULL, "updatedAt" = $2 WHERE "id" = $1"#,
        )
        .bind(id)
        .bind(now())
        .execute(&mut *conn)
        .await?;
        Ok(())
    }

    async fn reorder_board(
        &self,
        user_id: &str,
        status: ApplicationStatus,
        ordered_ids: &[String],
    ) -> DomainResult<Vec<Application>> {
        let mut conn = self.db.conn().await?;

        if !ordered_ids.is_empty() {
            // One statement rather than a write per card: a CASE over the id
            // maps each row to its index in `ordered_ids`.
            //
            // `updatedAt` is deliberately left alone. `is_likely_ghosted`
            // reads it, and bumping it here would clear the ghosted badge
            // from every card in the column because the user dragged one.
            let mut query = QueryBuilder::<Postgres>::new(
                r#"UPDATE "JobApplication" SET "boardPosition" = CASE "id""#,
            );
            for (index, id) in ordered_ids.iter().enumerate() {
                let position = i32::try_from(index).map_err(DomainError::internal)?;
                query
                    .push(" WHEN ")
                    .push_bind(id)
                    .push(" THEN ")
                    .push_bind(position)
                    .push("::integer");
            }
            query
                .push(r#" END WHERE "id" = ANY("#)
                .push_bind(ordered_ids)
                .push(r#") AND "userId" = "#)
                .push_bind(user_id)
                .push(r#" AND "status" = "#)
                .push_bind(status.as_str())
                .push(r#" AND "deletedAt" IS NULL"#);
            query.build().execute(&mut *conn).await?;
        }

        let rows = sqlx::query(
            r#"SELECT * FROM "JobApplication"
               WHERE "userId" = $1 AND "status" = $2 AND "deletedAt" IS NULL
               ORDER BY "boardPosition" ASC, "createdAt" DESC, "id" DESC"#,
        )
        .bind(user_id)
        .bind(status.as_str())
        .fetch_all(&mut *conn)
        .await?;
        attach_tags(&mut conn, &rows).await
    }

    async fn create(&self, data: CreateApplicationData) -> DomainResult<Application> {
        self.db.transaction(|| self.create_reserving_quota(&data)).await
    }

    async fn update(&self, id: &str, data: UpdateApplicationData) -> DomainResult<Application> {
        if let Some(tags) = &data.tags {
            return self.db.transaction(|| self.update_replacing_tags(id, &data, tags)).await;
        }

        let mut conn = self.db.conn().await?;
        let row = update_statement(id, &data).build().fetch_one(&mut *conn).await?;
        let updated = attach_tags(&mut conn, std::slice::from_ref(&row)).await?.pop();
        updated.ok_or_else(|| DomainError::internal("the updated application was not returned"))
    }

    async fn delete(&self, id: &str) -> DomainResult<()> {
        self.db.transaction(|| self.delete_releasing_quota(id)).await
    }

    async fn find_due_for_reminder(&self) -> DomainResult<Vec<Application>> {
        let now = now();
        let due_by = now + TimeDelta::milliseconds(reminder_window_ms::DUE_WITHIN);
        let resend_threshold = now - TimeDelta::milliseconds(reminder_window_ms::RESEND_AFTER);

        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT * FROM "JobApplication"
               WHERE "deletedAt" IS NULL
                 AND "followUpAt" >= $1
                 AND "followUpAt" <= $2
                 AND ("reminderSentAt" IS NULL OR "reminderSentAt" <= $3)"#,
        )
        .bind(now)
        .bind(due_by)
        .bind(resend_threshold)
        .fetch_all(&mut *conn)
        .await?;
        attach_tags(&mut conn, &rows).await
    }

    async fn update_reminder_sent_at(&self, id: &str, sent_at: DateTime<Utc>) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(
            r#"UPDATE "JobApplication" SET "reminderSentAt" = $2, "updatedAt" = $3 WHERE "id" = $1"#,
        )
        .bind(id)
        .bind(sent_at)
        .bind(now())
        .execute(&mut *conn)
        .await?;
        Ok(())
    }
}
