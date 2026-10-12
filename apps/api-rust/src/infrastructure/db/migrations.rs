//! Applies the Drizzle SQL migrations in `apps/api/drizzle`.
//!
//! `apps/api` owns the schema: `pnpm db:generate` writes the SQL there. This
//! runner reads the same files and records each by content hash in the same
//! `__drizzle_migrations` table, so a database migrated by either
//! implementation is recognised as migrated by the other.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::{Connection, PgConnection};

/// Fixed key for `pg_advisory_xact_lock`, the same one `apps/api` takes, so
/// concurrent runs of either runner serialize instead of both applying a
/// migration.
const MIGRATION_LOCK_KEY: i64 = 342_001;

/// drizzle-kit separates statements with this marker.
const STATEMENT_BREAKPOINT: &str = "--> statement-breakpoint";

#[derive(Debug, thiserror::Error)]
pub enum MigrationError {
    #[error("cannot read {path}: {source}")]
    Read { path: PathBuf, source: std::io::Error },
    #[error("migration journal {path} is not valid JSON: {source}")]
    Journal { path: PathBuf, source: serde_json::Error },
    #[error("migration {tag} failed: {source}")]
    Statement { tag: String, source: sqlx::Error },
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MigrationSummary {
    pub applied: usize,
    pub skipped: usize,
}

#[derive(Deserialize)]
struct Journal {
    entries: Vec<JournalEntry>,
}

#[derive(Deserialize)]
struct JournalEntry {
    idx: u32,
    tag: String,
}

struct Migration {
    tag: String,
    hash: String,
    statements: Vec<String>,
}

/// `apps/api/drizzle`, resolved from this crate's location in the monorepo.
pub fn default_migrations_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("api").join("drizzle")
}

fn read(path: &Path) -> Result<String, MigrationError> {
    fs::read_to_string(path)
        .map_err(|source| MigrationError::Read { path: path.to_path_buf(), source })
}

fn split_statements(source: &str) -> Vec<String> {
    source
        .split(STATEMENT_BREAKPOINT)
        .map(str::trim)
        .filter(|statement| !statement.is_empty())
        .map(str::to_string)
        .collect()
}

fn load_migrations(dir: &Path) -> Result<Vec<Migration>, MigrationError> {
    let journal_path = dir.join("meta").join("_journal.json");
    let journal: Journal = serde_json::from_str(&read(&journal_path)?)
        .map_err(|source| MigrationError::Journal { path: journal_path, source })?;

    let mut entries = journal.entries;
    entries.sort_by_key(|entry| entry.idx);

    entries
        .into_iter()
        .map(|entry| {
            let source = read(&dir.join(format!("{}.sql", entry.tag)))?;
            Ok(Migration {
                hash: hex::encode(Sha256::digest(source.as_bytes())),
                statements: split_statements(&source),
                tag: entry.tag,
            })
        })
        .collect()
}

/// Applies every migration not yet recorded, in one transaction.
///
/// Postgres DDL is transactional, so a migration that fails part-way leaves
/// no half-created tables and no tracking row. The cost is that a migration
/// may not contain a statement Postgres refuses inside a transaction
/// (`CREATE INDEX CONCURRENTLY`, `VACUUM`).
pub async fn apply_migrations(
    conn: &mut PgConnection,
    dir: &Path,
) -> Result<MigrationSummary, MigrationError> {
    let migrations = load_migrations(dir)?;
    let mut tx = conn.begin().await?;

    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(MIGRATION_LOCK_KEY)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
            id SERIAL PRIMARY KEY,
            hash TEXT NOT NULL UNIQUE,
            created_at BIGINT NOT NULL
        )"#,
    )
    .execute(&mut *tx)
    .await?;

    let applied_hashes: HashSet<String> =
        sqlx::query_scalar(r#"SELECT hash FROM "__drizzle_migrations""#)
            .fetch_all(&mut *tx)
            .await?
            .into_iter()
            .collect();

    let mut summary = MigrationSummary { applied: 0, skipped: 0 };
    for migration in migrations {
        if applied_hashes.contains(&migration.hash) {
            summary.skipped += 1;
            continue;
        }

        for statement in &migration.statements {
            sqlx::raw_sql(statement).execute(&mut *tx).await.map_err(|source| {
                MigrationError::Statement { tag: migration.tag.clone(), source }
            })?;
        }
        sqlx::query(r#"INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)"#)
            .bind(&migration.hash)
            .bind(chrono::Utc::now().timestamp_millis())
            .execute(&mut *tx)
            .await?;
        summary.applied += 1;
    }

    tx.commit().await?;
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_on_the_drizzle_breakpoint_and_drops_blanks() {
        let source = "CREATE TABLE a ();\n--> statement-breakpoint\nCREATE TABLE b ();--> statement-breakpoint\n  \n";
        assert_eq!(split_statements(source), vec!["CREATE TABLE a ();", "CREATE TABLE b ();"]);
    }

    #[test]
    fn loads_the_checked_in_migrations_in_journal_order() {
        let migrations = load_migrations(&default_migrations_dir()).unwrap();

        assert!(!migrations.is_empty());
        assert_eq!(migrations[0].tag, "0000_postgres_baseline");
        assert_eq!(migrations[0].hash.len(), 64);
        assert!(migrations[0].statements[0].starts_with(r#"CREATE TABLE "User""#));
    }

    #[test]
    fn reports_a_missing_journal_with_its_path() {
        let err = load_migrations(Path::new("/nonexistent")).err().unwrap();
        assert!(err.to_string().contains("/nonexistent/meta/_journal.json"));
    }
}
