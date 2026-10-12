use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use super::support::unknown_value;
use crate::domain::oauth_account::{OAuthAccount, OAuthProviderName};
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateOAuthAccountData, OAuthAccountRepository};

pub struct PgOAuthAccountRepository {
    db: Db,
}

impl PgOAuthAccountRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> DomainResult<OAuthAccount> {
    let provider: String = row.try_get("provider")?;
    Ok(OAuthAccount {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        provider: OAuthProviderName::parse(&provider)
            .ok_or_else(|| unknown_value("OAuthAccount", "provider", &provider))?,
        provider_account_id: row.try_get("providerAccountId")?,
        email: row.try_get("email")?,
        created_at: row.try_get("createdAt")?,
    })
}

#[async_trait]
impl OAuthAccountRepository for PgOAuthAccountRepository {
    async fn find_by_provider(
        &self,
        provider: OAuthProviderName,
        provider_account_id: &str,
    ) -> DomainResult<Option<OAuthAccount>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"SELECT * FROM "OAuthAccount"
               WHERE "provider" = $1 AND "providerAccountId" = $2 LIMIT 1"#,
        )
        .bind(provider.as_str())
        .bind(provider_account_id)
        .fetch_optional(&mut *conn)
        .await?;
        row.as_ref().map(to_entity).transpose()
    }

    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<OAuthAccount>> {
        let mut conn = self.db.conn().await?;
        let rows = sqlx::query(r#"SELECT * FROM "OAuthAccount" WHERE "userId" = $1"#)
            .bind(user_id)
            .fetch_all(&mut *conn)
            .await?;
        rows.iter().map(to_entity).collect()
    }

    async fn create(&self, data: CreateOAuthAccountData) -> DomainResult<OAuthAccount> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "OAuthAccount"
                 ("id", "userId", "provider", "providerAccountId", "email", "createdAt")
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.user_id)
        .bind(data.provider.as_str())
        .bind(&data.provider_account_id)
        .bind(&data.email)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        to_entity(&row)
    }

    async fn delete(&self, id: &str) -> DomainResult<()> {
        let mut conn = self.db.conn().await?;
        sqlx::query(r#"DELETE FROM "OAuthAccount" WHERE "id" = $1"#)
            .bind(id)
            .execute(&mut *conn)
            .await?;
        Ok(())
    }
}
