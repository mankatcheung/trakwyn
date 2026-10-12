use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use crate::domain::cookie_consent::CookieConsent;
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CookieConsentRepository, CreateCookieConsentData};

pub struct PgCookieConsentRepository {
    db: Db,
}

impl PgCookieConsentRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> Result<CookieConsent, sqlx::Error> {
    Ok(CookieConsent {
        id: row.try_get("id")?,
        analytics_accepted: row.try_get("analyticsAccepted")?,
        ip_address: row.try_get("ipAddress")?,
        user_agent: row.try_get("userAgent")?,
        consented_at: row.try_get("consentedAt")?,
    })
}

#[async_trait]
impl CookieConsentRepository for PgCookieConsentRepository {
    async fn create(&self, data: CreateCookieConsentData) -> DomainResult<CookieConsent> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "CookieConsent"
                 ("id", "analyticsAccepted", "ipAddress", "userAgent", "consentedAt")
               VALUES ($1, $2, $3, $4, $5)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(data.analytics_accepted)
        .bind(&data.ip_address)
        .bind(&data.user_agent)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        Ok(to_entity(&row)?)
    }
}
