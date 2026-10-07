use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::{Postgres, QueryBuilder, Row};

use crate::domain::skill::Skill;
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{CreateSkillData, SkillRepository, UpdateSkillData};

/// What Drizzle throws for an update that sets nothing.
const NO_VALUES_TO_SET: &str = "No values to set";

pub struct PgSkillRepository {
    db: Db,
}

impl PgSkillRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> Result<Skill, sqlx::Error> {
    Ok(Skill {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        name: row.try_get("name")?,
        category: row.try_get("category")?,
        proficiency: row.try_get("proficiency")?,
        created_at: row.try_get("createdAt")?,
    })
}

#[async_trait]
impl SkillRepository for PgSkillRepository {
    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Skill>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT * FROM "Skill" WHERE "userId" = $1 ORDER BY "createdAt" DESC, "id" DESC"#,
        )
        .bind(user_id)
        .fetch_all(&mut *conn)
        .await?;
        Ok(rows.iter().map(to_entity).collect::<Result<_, _>>()?)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Skill>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(r#"SELECT * FROM "Skill" WHERE "id" = $1 LIMIT 1"#)
            .bind(id)
            .fetch_optional(&mut *conn)
            .await?;
        Ok(row.as_ref().map(to_entity).transpose()?)
    }

    async fn create(&self, data: CreateSkillData) -> DomainResult<Skill> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "Skill" ("id", "userId", "name", "category", "proficiency", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.user_id)
        .bind(&data.name)
        .bind(&data.category)
        .bind(&data.proficiency)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        Ok(to_entity(&row)?)
    }

    async fn update(&self, id: &str, data: UpdateSkillData) -> DomainResult<Skill> {
        // A skill has no `updatedAt`, so an empty update has no column to set.
        if data.is_empty() {
            return Err(DomainError::internal(NO_VALUES_TO_SET));
        }

        let mut conn = self.db.conn().await?;
        let mut query = QueryBuilder::<Postgres>::new(r#"UPDATE "Skill" SET "#);
        let mut assignments = query.separated(", ");
        if let Some(name) = data.name {
            assignments.push(r#""name" = "#).push_bind_unseparated(name);
        }
        if let Some(category) = data.category {
            assignments.push(r#""category" = "#).push_bind_unseparated(category);
        }
        if let Some(proficiency) = data.proficiency {
            assignments.push(r#""proficiency" = "#).push_bind_unseparated(proficiency);
        }
        query.push(r#" WHERE "id" = "#).push_bind(id).push(" RETURNING *");

        let row = query.build().fetch_one(&mut *conn).await?;
        Ok(to_entity(&row)?)
    }

    async fn delete(&self, id: &str, _user_id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"DELETE FROM "Skill" WHERE "id" = $1"#).bind(id).execute(&mut *conn).await?;
        Ok(())
    }
}
