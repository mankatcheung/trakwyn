use async_trait::async_trait;
use sqlx::postgres::PgRow;
use sqlx::Row;

use crate::domain::mcp_oauth::McpOAuthClient;
use crate::infrastructure::db::Db;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{CreateMcpOAuthClientData, McpOAuthClientRepository};

pub struct PgMcpOAuthClientRepository {
    db: Db,
}

impl PgMcpOAuthClientRepository {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

fn to_entity(row: &PgRow) -> Result<McpOAuthClient, sqlx::Error> {
    // `redirectUris` is a JSON array in a text column. Anything that is not an
    // array of strings reads as no redirect URIs, so such a client can never
    // be redirected to.
    let stored: String = row.try_get("redirectUris")?;
    let redirect_uris = serde_json::from_str::<Vec<String>>(&stored).unwrap_or_default();
    Ok(McpOAuthClient {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        redirect_uris,
        revoked_at: row.try_get("revokedAt")?,
        created_at: row.try_get("createdAt")?,
    })
}

#[async_trait]
impl McpOAuthClientRepository for PgMcpOAuthClientRepository {
    async fn create(&self, data: CreateMcpOAuthClientData) -> DomainResult<McpOAuthClient> {
        let redirect_uris =
            serde_json::to_string(&data.redirect_uris).map_err(DomainError::internal)?;
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(
            r#"INSERT INTO "McpOAuthClient" ("id", "name", "redirectUris", "createdAt")
               VALUES ($1, $2, $3, $4)
               RETURNING *"#,
        )
        .bind(&data.id)
        .bind(&data.name)
        .bind(redirect_uris)
        .bind(now())
        .fetch_one(&mut *conn)
        .await?;
        Ok(to_entity(&row)?)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<McpOAuthClient>> {
        let mut conn = self.db.conn().await?;
        let row = sqlx::query(r#"SELECT * FROM "McpOAuthClient" WHERE "id" = $1 LIMIT 1"#)
            .bind(id)
            .fetch_optional(&mut *conn)
            .await?;
        Ok(row.as_ref().map(to_entity).transpose()?)
    }
}
