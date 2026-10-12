use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::{Postgres, QueryBuilder, Row};

use crate::domain::education::Education;
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateEducationData, EducationRepository, UpdateEducationData};

pub struct PgEducationRepository {
    db: Db,
}

impl PgEducationRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> Result<Education, sqlx::Error> {
    Ok(Education {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        institution: row.try_get("institution")?,
        degree: row.try_get("degree")?,
        field: row.try_get("field")?,
        start_date: row.try_get("startDate")?,
        end_date: row.try_get("endDate")?,
        description: row.try_get("description")?,
        created_at: row.try_get("createdAt")?,
        updated_at: row.try_get("updatedAt")?,
    })
}

#[async_trait]
impl EducationRepository for PgEducationRepository {
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Education>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT * FROM "Education" WHERE "userId" = $1 ORDER BY "startDate" DESC, "id" DESC"#,
        )
        .bind(user_id)
        .fetch_all(&mut *conn)
        .await?;
        Ok(rows.iter().map(to_entity).collect::<Result<_, _>>()?)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Education>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(r#"SELECT * FROM "Education" WHERE "id" = $1 LIMIT 1"#)
            .bind(id)
            .fetch_optional(&mut *conn)
            .await?;
        Ok(row.as_ref().map(to_entity).transpose()?)
    }

    async fn create(&self, data: CreateEducationData) -> DomainResult<Education> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "Education"
                 ("id", "userId", "institution", "degree", "field", "startDate", "endDate",
                  "description", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.user_id)
        .bind(&data.institution)
        .bind(&data.degree)
        .bind(&data.field)
        .bind(data.start_date)
        .bind(data.end_date)
        .bind(&data.description)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        Ok(to_entity(&row)?)
    }

    async fn update(&self, id: &str, data: UpdateEducationData) -> DomainResult<Education> {
        let mut conn = self.db.conn().await?;
        let mut query = QueryBuilder::<Postgres>::new(r#"UPDATE "Education" SET "updatedAt" = "#);
        query.push_bind(now());
        if let Some(institution) = data.institution {
            query.push(r#", "institution" = "#).push_bind(institution);
        }
        if let Some(degree) = data.degree {
            query.push(r#", "degree" = "#).push_bind(degree);
        }
        if let Some(field) = data.field {
            query.push(r#", "field" = "#).push_bind(field);
        }
        if let Some(start_date) = data.start_date {
            query.push(r#", "startDate" = "#).push_bind(start_date);
        }
        if let Some(end_date) = data.end_date {
            query.push(r#", "endDate" = "#).push_bind(end_date);
        }
        if let Some(description) = data.description {
            query.push(r#", "description" = "#).push_bind(description);
        }
        query.push(r#" WHERE "id" = "#).push_bind(id).push(" RETURNING *");

        let row = query.build().fetch_one(&mut *conn).await?;
        Ok(to_entity(&row)?)
    }

    async fn delete(&self, id: &str, _user_id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"DELETE FROM "Education" WHERE "id" = $1"#)
            .bind(id)
            .execute(&mut *conn)
            .await?;
        Ok(())
    }
}
