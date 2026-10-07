use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::{Postgres, QueryBuilder, Row};

use crate::domain::contact::Contact;
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{ContactRepository, CreateContactData, UpdateContactData};

pub struct PgContactRepository {
    db: Db,
}

impl PgContactRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> Result<Contact, sqlx::Error> {
    Ok(Contact {
        id: row.try_get("id")?,
        application_id: row.try_get("applicationId")?,
        name: row.try_get("name")?,
        role: row.try_get("role")?,
        email: row.try_get("email")?,
        phone: row.try_get("phone")?,
        linkedin_url: row.try_get("linkedinUrl")?,
        notes: row.try_get("notes")?,
        created_at: row.try_get("createdAt")?,
        updated_at: row.try_get("updatedAt")?,
    })
}

#[async_trait]
impl ContactRepository for PgContactRepository {
    async fn find_all_by_application_id(&self, application_id: &str) -> DomainResult<Vec<Contact>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT * FROM "Contact" WHERE "applicationId" = $1 ORDER BY "createdAt" ASC"#,
        )
        .bind(application_id)
        .fetch_all(&mut *conn)
        .await?;
        Ok(rows.iter().map(to_entity).collect::<Result<_, _>>()?)
    }

    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64> {
        let mut conn = self.db.conn().await?;
        let count =
            sqlx::query_scalar(r#"SELECT count(*) FROM "Contact" WHERE "applicationId" = $1"#)
                .bind(application_id)
                .fetch_one(&mut *conn)
                .await?;
        Ok(count)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Contact>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(r#"SELECT * FROM "Contact" WHERE "id" = $1 LIMIT 1"#)
            .bind(id)
            .fetch_optional(&mut *conn)
            .await?;
        Ok(row.as_ref().map(to_entity).transpose()?)
    }

    async fn create(&self, data: CreateContactData) -> DomainResult<Contact> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "Contact"
                 ("id", "applicationId", "name", "role", "email", "phone", "linkedinUrl", "notes",
                  "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.application_id)
        .bind(&data.name)
        .bind(&data.role)
        .bind(&data.email)
        .bind(&data.phone)
        .bind(&data.linkedin_url)
        .bind(&data.notes)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        Ok(to_entity(&row)?)
    }

    async fn update(&self, id: &str, data: UpdateContactData) -> DomainResult<Contact> {
        let mut query = QueryBuilder::<Postgres>::new(r#"UPDATE "Contact" SET "updatedAt" = "#);
        query.push_bind(now());
        if let Some(name) = data.name {
            query.push(r#", "name" = "#).push_bind(name);
        }
        if let Some(role) = data.role {
            query.push(r#", "role" = "#).push_bind(role);
        }
        if let Some(email) = data.email {
            query.push(r#", "email" = "#).push_bind(email);
        }
        if let Some(phone) = data.phone {
            query.push(r#", "phone" = "#).push_bind(phone);
        }
        if let Some(linkedin_url) = data.linkedin_url {
            query.push(r#", "linkedinUrl" = "#).push_bind(linkedin_url);
        }
        if let Some(notes) = data.notes {
            query.push(r#", "notes" = "#).push_bind(notes);
        }
        query.push(r#" WHERE "id" = "#).push_bind(id).push(" RETURNING *");

        let mut conn = self.db.conn().await?;
        let row = query.build().fetch_one(&mut *conn).await?;
        Ok(to_entity(&row)?)
    }

    async fn delete(&self, id: &str, _application_id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"DELETE FROM "Contact" WHERE "id" = $1"#)
            .bind(id)
            .execute(&mut *conn)
            .await?;
        Ok(())
    }
}
