use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use super::support::unknown_value;
use crate::domain::push_subscription::{PushSubscription, PushSubscriptionProvider};
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{PushSubscriptionRepository, UpsertPushSubscriptionData};

/// Unlike the other repositories this one runs on the pool, never on an
/// ambient transaction: `apps/api`'s `DrizzlePushSubscriptionRepository`
/// queries its `db` directly instead of going through the transaction
/// context, and this keeps that behaviour.
pub struct PgPushSubscriptionRepository {
    db: Db,
}

impl PgPushSubscriptionRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> DomainResult<PushSubscription> {
    let provider: String = row.try_get("provider")?;
    Ok(PushSubscription {
        id: row.try_get("id")?,
        user_id: row.try_get("userId")?,
        provider: PushSubscriptionProvider::parse(&provider)
            .ok_or_else(|| unknown_value("PushSubscription", "provider", &provider))?,
        endpoint: row.try_get("endpoint")?,
        p256dh: row.try_get("p256dh")?,
        auth: row.try_get("auth")?,
        created_at: row.try_get("createdAt")?,
        updated_at: row.try_get("updatedAt")?,
    })
}

#[async_trait]
impl PushSubscriptionRepository for PgPushSubscriptionRepository {
    async fn find_by_user_id(&self, user_id: &str) -> DomainResult<Vec<PushSubscription>> {
        let rows = sqlx::query(r#"SELECT * FROM "PushSubscription" WHERE "userId" = $1"#)
            .bind(user_id)
            .fetch_all(self.db.pool())
            .await?;
        rows.iter().map(to_entity).collect()
    }

    async fn find_by_endpoint(&self, endpoint: &str) -> DomainResult<Option<PushSubscription>> {
        let row = sqlx::query(r#"SELECT * FROM "PushSubscription" WHERE "endpoint" = $1 LIMIT 1"#)
            .bind(endpoint)
            .fetch_optional(self.db.pool())
            .await?;
        row.as_ref().map(to_entity).transpose()
    }

    async fn upsert(
        &self,
        subscription: UpsertPushSubscriptionData,
    ) -> DomainResult<PushSubscription> {
        let timestamp = now();
        sqlx::query(
            r#"INSERT INTO "PushSubscription"
                 ("id", "userId", "provider", "endpoint", "p256dh", "auth", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
               ON CONFLICT ("endpoint") DO UPDATE SET
                 "provider" = EXCLUDED."provider",
                 "p256dh" = EXCLUDED."p256dh",
                 "auth" = EXCLUDED."auth",
                 "userId" = EXCLUDED."userId",
                 "updatedAt" = EXCLUDED."updatedAt""#,
        )
        .bind(&subscription.id)
        .bind(&subscription.user_id)
        .bind(subscription.provider.as_str())
        .bind(&subscription.endpoint)
        .bind(&subscription.p256dh)
        .bind(&subscription.auth)
        .bind(timestamp)
        .execute(self.db.pool())
        .await?;

        // The input echoed back with the new timestamps, not the stored row:
        // on a conflict the row keeps its original id and createdAt.
        Ok(PushSubscription {
            id: subscription.id,
            user_id: subscription.user_id,
            provider: subscription.provider,
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
            created_at: timestamp,
            updated_at: timestamp,
        })
    }

    async fn delete_by_endpoint(&self, endpoint: &str) -> DomainResult<()> {
        sqlx::query(r#"DELETE FROM "PushSubscription" WHERE "endpoint" = $1"#)
            .bind(endpoint)
            .execute(self.db.pool())
            .await?;
        Ok(())
    }

    async fn delete_by_user_id(&self, user_id: &str) -> DomainResult<()> {
        sqlx::query(r#"DELETE FROM "PushSubscription" WHERE "userId" = $1"#)
            .bind(user_id)
            .execute(self.db.pool())
            .await?;
        Ok(())
    }
}
