use sqlx::Connection;

use trakwyn_api::infrastructure::db::migrations::{apply_migrations, default_migrations_dir};

use crate::common::TestDb;

#[tokio::test]
async fn a_migrated_database_has_the_baseline_tables() {
    let TestDb { db } = TestDb::create().await;

    let tables: Vec<String> = sqlx::query_scalar(
        "SELECT table_name::text FROM information_schema.tables WHERE table_schema = 'public'",
    )
    .fetch_all(db.pool())
    .await
    .unwrap();

    for expected in ["User", "Session", "JobApplication", "Note", "ActivityLog"] {
        assert!(tables.iter().any(|table| table == expected), "missing table {expected}");
    }
}

#[tokio::test]
async fn applying_twice_skips_what_is_already_recorded() {
    let TestDb { db } = TestDb::create().await;
    let mut conn = db.pool().acquire().await.unwrap().detach();

    // The template this database was cloned from is already migrated.
    let summary = apply_migrations(&mut conn, &default_migrations_dir()).await.unwrap();

    assert_eq!(summary.applied, 0);
    assert!(summary.skipped >= 1);
    conn.close().await.unwrap();
}

#[tokio::test]
async fn records_each_migration_by_the_hash_apps_api_would_record() {
    let TestDb { db } = TestDb::create().await;

    let hashes: Vec<String> = sqlx::query_scalar(r#"SELECT hash FROM "__drizzle_migrations""#)
        .fetch_all(db.pool())
        .await
        .unwrap();

    // sha256 of the file's bytes, hex: what `applyMigrations.ts` computes, so
    // a database migrated here is "already migrated" to `pnpm db:migrate`.
    let source =
        std::fs::read(default_migrations_dir().join("0000_postgres_baseline.sql")).unwrap();
    let expected = hex::encode(<sha2::Sha256 as sha2::Digest>::digest(&source));
    assert!(hashes.contains(&expected));
}
