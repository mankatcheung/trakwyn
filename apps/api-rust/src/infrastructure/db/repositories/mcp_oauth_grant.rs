use std::cmp::Reverse;
use std::collections::{HashMap, HashSet};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::Row;

use super::support::unknown_value;
use crate::domain::mcp_oauth::{McpOAuthGrant, McpOAuthScope};
use crate::infrastructure::db::Db;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::McpOAuthGrantRepository;

pub struct PgMcpOAuthGrantRepository {
    db: Db,
}

impl PgMcpOAuthGrantRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

#[async_trait]
impl McpOAuthGrantRepository for PgMcpOAuthGrantRepository {
    async fn find_active_by_user_id(
        &self,
        user_id: &str,
        now: DateTime<Utc>,
    ) -> DomainResult<Vec<McpOAuthGrant>> {
        let mut conn = self.db.conn().await?;

        // The authorization code is the record of the consent itself: exactly
        // one row per grant, written when the user approved, carrying what
        // they approved. Refresh tokens would say the same thing but multiply
        // with every rotation, so they are only asked the question they alone
        // can answer: is this grant still live.
        let consents = sqlx::query(
            r#"SELECT c."familyId" AS "id", c."clientId", cl."name" AS "clientName",
                      c."scope", c."createdAt" AS "authorizedAt"
               FROM "McpOAuthAuthorizationCode" c
               INNER JOIN "McpOAuthClient" cl ON cl."id" = c."clientId"
               WHERE c."userId" = $1"#,
        )
        .bind(user_id)
        .fetch_all(&mut *conn)
        .await?;
        if consents.is_empty() {
            return Ok(Vec::new());
        }

        let live: HashSet<String> = sqlx::query_scalar(
            r#"SELECT "familyId" FROM "McpOAuthRefreshToken"
               WHERE "userId" = $1 AND "revokedAt" IS NULL AND "expiresAt" > $2
               GROUP BY "familyId""#,
        )
        .bind(user_id)
        .bind(now)
        .fetch_all(&mut *conn)
        .await?
        .into_iter()
        .collect();

        // Aggregated rather than fetched: access tokens accumulate one row per
        // refresh, and only the most recent use is of interest.
        let used = sqlx::query(
            r#"SELECT "familyId", max("lastUsedAt") AS "lastUsedAt"
               FROM "McpOAuthAccessToken"
               WHERE "userId" = $1
               GROUP BY "familyId""#,
        )
        .bind(user_id)
        .fetch_all(&mut *conn)
        .await?;
        let mut last_used: HashMap<String, Option<DateTime<Utc>>> = HashMap::new();
        for row in &used {
            last_used.insert(row.try_get("familyId")?, row.try_get("lastUsedAt")?);
        }

        let mut grants = Vec::new();
        for consent in &consents {
            let id: String = consent.try_get("id")?;
            if !live.contains(&id) {
                continue;
            }
            let scope: String = consent.try_get("scope")?;
            grants.push(McpOAuthGrant {
                last_used_at: last_used.get(&id).copied().flatten(),
                id,
                user_id: user_id.to_string(),
                client_id: consent.try_get("clientId")?,
                client_name: consent.try_get("clientName")?,
                scope: McpOAuthScope::parse(&scope)
                    .ok_or_else(|| unknown_value("McpOAuthAuthorizationCode", "scope", &scope))?,
                authorized_at: consent.try_get("authorizedAt")?,
            });
        }
        grants.sort_by_key(|grant| Reverse(grant.authorized_at));
        Ok(grants)
    }
}
