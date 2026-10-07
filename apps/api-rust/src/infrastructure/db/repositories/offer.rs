use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::{Postgres, QueryBuilder, Row};

use super::support::unknown_value;
use crate::domain::offer::{Offer, OfferPeriod};
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateOfferData, OfferRepository, UpdateOfferData};

const DEFAULT_CURRENCY: &str = "USD";
const DEFAULT_PERIOD: OfferPeriod = OfferPeriod::Yearly;

pub struct PgOfferRepository {
    db: Db,
}

impl PgOfferRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> DomainResult<Offer> {
    let period: String = row.try_get("period")?;
    Ok(Offer {
        id: row.try_get("id")?,
        application_id: row.try_get("applicationId")?,
        base_salary: row.try_get("baseSalary")?,
        bonus: row.try_get("bonus")?,
        equity: row.try_get("equity")?,
        benefits: row.try_get("benefits")?,
        cost_of_living_adjustment: row.try_get("costOfLivingAdjustment")?,
        currency: row.try_get("currency")?,
        period: OfferPeriod::parse(&period)
            .ok_or_else(|| unknown_value("Offer", "period", &period))?,
        notes: row.try_get("notes")?,
        created_at: row.try_get("createdAt")?,
        updated_at: row.try_get("updatedAt")?,
    })
}

fn to_entities(rows: &[PgRow]) -> DomainResult<Vec<Offer>> {
    rows.iter().map(to_entity).collect()
}

#[async_trait]
impl OfferRepository for PgOfferRepository {
    async fn find_all_by_application_id(&self, application_id: &str) -> DomainResult<Vec<Offer>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(r#"SELECT * FROM "Offer" WHERE "applicationId" = $1"#)
            .bind(application_id)
            .fetch_all(&mut *conn)
            .await?;
        to_entities(&rows)
    }

    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64> {
        let mut conn = self.db.conn().await?;
        let count =
            sqlx::query_scalar(r#"SELECT count(*) FROM "Offer" WHERE "applicationId" = $1"#)
                .bind(application_id)
                .fetch_one(&mut *conn)
                .await?;
        Ok(count)
    }

    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Offer>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(
            r#"SELECT o.* FROM "Offer" o
               INNER JOIN "JobApplication" a ON o."applicationId" = a."id"
               WHERE a."userId" = $1 AND a."deletedAt" IS NULL"#,
        )
        .bind(user_id)
        .fetch_all(&mut *conn)
        .await?;
        to_entities(&rows)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Offer>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(r#"SELECT * FROM "Offer" WHERE "id" = $1"#)
            .bind(id)
            .fetch_optional(&mut *conn)
            .await?;
        row.as_ref().map(to_entity).transpose()
    }

    async fn create(&self, data: CreateOfferData) -> DomainResult<Offer> {
        let timestamp = now();
        // Returned as built rather than read back, as the original does.
        let offer = Offer {
            id: data.id,
            application_id: data.application_id,
            base_salary: data.base_salary,
            bonus: data.bonus,
            equity: data.equity,
            benefits: data.benefits,
            cost_of_living_adjustment: data.cost_of_living_adjustment,
            currency: data.currency.unwrap_or_else(|| DEFAULT_CURRENCY.to_string()),
            period: data.period.unwrap_or(DEFAULT_PERIOD),
            notes: data.notes,
            created_at: timestamp,
            updated_at: timestamp,
        };

        let mut conn = self.db.conn().await?;
        sqlx::query(
            r#"INSERT INTO "Offer"
                 ("id", "applicationId", "baseSalary", "bonus", "equity", "benefits",
                  "costOfLivingAdjustment", "currency", "period", "notes", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)"#,
        )
        .bind(&offer.id)
        .bind(&offer.application_id)
        .bind(offer.base_salary)
        .bind(offer.bonus)
        .bind(&offer.equity)
        .bind(&offer.benefits)
        .bind(offer.cost_of_living_adjustment)
        .bind(&offer.currency)
        .bind(offer.period.as_str())
        .bind(&offer.notes)
        .bind(offer.created_at)
        .bind(offer.updated_at)
        .execute(&mut *conn)
        .await?;
        Ok(offer)
    }

    async fn update(&self, id: &str, data: UpdateOfferData) -> DomainResult<Offer> {
        let mut query = QueryBuilder::<Postgres>::new(r#"UPDATE "Offer" SET "updatedAt" = "#);
        query.push_bind(now());
        if let Some(base_salary) = data.base_salary {
            query.push(r#", "baseSalary" = "#).push_bind(base_salary);
        }
        if let Some(bonus) = data.bonus {
            query.push(r#", "bonus" = "#).push_bind(bonus);
        }
        if let Some(equity) = data.equity {
            query.push(r#", "equity" = "#).push_bind(equity);
        }
        if let Some(benefits) = data.benefits {
            query.push(r#", "benefits" = "#).push_bind(benefits);
        }
        if let Some(cost_of_living_adjustment) = data.cost_of_living_adjustment {
            query.push(r#", "costOfLivingAdjustment" = "#).push_bind(cost_of_living_adjustment);
        }
        if let Some(currency) = data.currency {
            query.push(r#", "currency" = "#).push_bind(currency);
        }
        if let Some(period) = data.period {
            query.push(r#", "period" = "#).push_bind(period.as_str());
        }
        if let Some(notes) = data.notes {
            query.push(r#", "notes" = "#).push_bind(notes);
        }
        query.push(r#" WHERE "id" = "#).push_bind(id).push(" RETURNING *");

        let mut conn = self.db.conn().await?;
        let row = query.build().fetch_one(&mut *conn).await?;
        to_entity(&row)
    }

    async fn delete(&self, id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"DELETE FROM "Offer" WHERE "id" = $1"#).bind(id).execute(&mut *conn).await?;
        Ok(())
    }
}
