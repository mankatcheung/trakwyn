//! Repository tests against a real Postgres with the real migrations.

use trakwyn_api::domain::activity_log::ActivityEventType;
use trakwyn_api::infrastructure::db::repositories::{
    PgActivityLogRepository, PgApplicationRepository, PgNoteRepository,
};
use trakwyn_api::infrastructure::db::Db;
use trakwyn_api::use_cases::clock::now;
use trakwyn_api::use_cases::errors::{DomainError, DomainResult};
use trakwyn_api::use_cases::ports::{
    ActivityLogRepository, AppendActivityLogData, ApplicationRepository, CreateNoteData,
    NoteRepository,
};

use crate::common::{seed_application, seed_user, TestDb};

async fn seeded() -> Db {
    let TestDb { db } = TestDb::create().await;
    seed_user(&db, "user-1").await;
    seed_application(&db, "app-1", "user-1").await;
    db
}

fn note_data(id: &str, application_id: &str) -> CreateNoteData {
    CreateNoteData {
        id: id.to_string(),
        application_id: application_id.to_string(),
        content: format!("content of {id}"),
    }
}

mod notes {
    use super::*;

    #[tokio::test]
    async fn creates_and_reads_back_a_note() {
        let db = seeded().await;
        let notes = PgNoteRepository::new(db);

        let created = notes.create(note_data("note-1", "app-1")).await.unwrap();

        assert_eq!(created.content, "content of note-1");
        assert_eq!(created.created_at, created.updated_at);
        // What was returned is what is stored: no sub-millisecond drift.
        assert_eq!(notes.find_by_id("note-1").await.unwrap(), Some(created));
    }

    #[tokio::test]
    async fn finds_nothing_for_an_unknown_id() {
        let notes = PgNoteRepository::new(seeded().await);
        assert_eq!(notes.find_by_id("missing").await.unwrap(), None);
    }

    #[tokio::test]
    async fn lists_an_applications_notes_newest_first() {
        let db = seeded().await;
        seed_application(&db, "app-2", "user-1").await;
        let notes = PgNoteRepository::new(db);

        notes.create(note_data("first", "app-1")).await.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        notes.create(note_data("second", "app-1")).await.unwrap();
        notes.create(note_data("elsewhere", "app-2")).await.unwrap();

        let listed = notes.find_all_by_application_id("app-1").await.unwrap();
        let ids: Vec<&str> = listed.iter().map(|note| note.id.as_str()).collect();
        assert_eq!(ids, vec!["second", "first"]);
        assert_eq!(notes.count_by_application_id("app-1").await.unwrap(), 2);
    }

    #[tokio::test]
    async fn an_update_rewrites_the_content_and_moves_updated_at() {
        let notes = PgNoteRepository::new(seeded().await);
        let created = notes.create(note_data("note-1", "app-1")).await.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;

        let updated = notes.update("note-1", "Rewritten").await.unwrap();

        assert_eq!(updated.content, "Rewritten");
        assert_eq!(updated.created_at, created.created_at);
        assert!(updated.updated_at > created.updated_at);
    }

    #[tokio::test]
    async fn deletes_a_note() {
        let notes = PgNoteRepository::new(seeded().await);
        notes.create(note_data("note-1", "app-1")).await.unwrap();

        notes.delete("note-1", "app-1").await.unwrap();

        assert_eq!(notes.find_by_id("note-1").await.unwrap(), None);
    }

    #[tokio::test]
    async fn deleting_the_application_cascades_to_its_notes() {
        let db = seeded().await;
        let notes = PgNoteRepository::new(db.clone());
        notes.create(note_data("note-1", "app-1")).await.unwrap();

        sqlx::query(r#"DELETE FROM "JobApplication" WHERE "id" = 'app-1'"#)
            .execute(db.pool())
            .await
            .unwrap();

        assert_eq!(notes.find_by_id("note-1").await.unwrap(), None);
    }

    #[tokio::test]
    async fn recent_notes_skip_the_excluded_trashed_and_foreign_applications() {
        let db = seeded().await;
        seed_application(&db, "app-other", "user-1").await;
        seed_application(&db, "app-trashed", "user-1").await;
        seed_user(&db, "user-2").await;
        seed_application(&db, "app-foreign", "user-2").await;
        sqlx::query(r#"UPDATE "JobApplication" SET "deletedAt" = $1 WHERE "id" = 'app-trashed'"#)
            .bind(now())
            .execute(db.pool())
            .await
            .unwrap();

        let notes = PgNoteRepository::new(db);
        for (id, application_id) in [
            ("current", "app-1"),
            ("wanted", "app-other"),
            ("trashed", "app-trashed"),
            ("foreign", "app-foreign"),
        ] {
            notes.create(note_data(id, application_id)).await.unwrap();
        }

        let recent =
            notes.find_recent_by_user_excluding_application("user-1", "app-1", 10).await.unwrap();

        let ids: Vec<&str> = recent.iter().map(|note| note.id.as_str()).collect();
        assert_eq!(ids, vec!["wanted"]);
    }
}

mod applications {
    use super::*;

    #[tokio::test]
    async fn finds_a_live_application_with_its_tags() {
        let db = seeded().await;
        sqlx::query(
            r#"INSERT INTO "ApplicationTag" ("id", "applicationId", "name")
               VALUES ('t1', 'app-1', 'remote'), ('t2', 'app-1', 'fintech')"#,
        )
        .execute(db.pool())
        .await
        .unwrap();

        let found = PgApplicationRepository::new(db).find_by_id("app-1").await.unwrap().unwrap();

        assert_eq!(found.user_id, "user-1");
        assert_eq!(found.company, "Acme");
        // The column defaults Drizzle declared.
        assert_eq!(found.status.as_str(), "draft");
        assert!(!found.starred);
        let mut tags = found.tags;
        tags.sort();
        assert_eq!(tags, vec!["fintech", "remote"]);
    }

    #[tokio::test]
    async fn a_trashed_application_reads_as_missing() {
        let db = seeded().await;
        sqlx::query(r#"UPDATE "JobApplication" SET "deletedAt" = $1 WHERE "id" = 'app-1'"#)
            .bind(now())
            .execute(db.pool())
            .await
            .unwrap();

        assert_eq!(PgApplicationRepository::new(db).find_by_id("app-1").await.unwrap(), None);
    }
}

mod activity_logs {
    use super::*;

    fn entry(id: &str, event_type: ActivityEventType) -> AppendActivityLogData {
        AppendActivityLogData {
            id: id.to_string(),
            application_id: "app-1".to_string(),
            actor_id: "user-1".to_string(),
            event_type,
            payload: r#"{"noteId":"n"}"#.to_string(),
        }
    }

    #[tokio::test]
    async fn appends_and_lists_newest_first_per_application() {
        let logs = PgActivityLogRepository::new(seeded().await);

        logs.append(entry("log-1", ActivityEventType::NoteAdded)).await.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        logs.append(entry("log-2", ActivityEventType::NoteDeleted)).await.unwrap();

        let listed = logs.find_all_by_application_id("app-1").await.unwrap();
        let ids: Vec<&str> = listed.iter().map(|log| log.id.as_str()).collect();
        assert_eq!(ids, vec!["log-2", "log-1"]);
        assert_eq!(listed[0].event_type, ActivityEventType::NoteDeleted);
    }

    #[tokio::test]
    async fn lists_oldest_first_across_a_users_applications() {
        let db = seeded().await;
        seed_user(&db, "user-2").await;
        seed_application(&db, "app-foreign", "user-2").await;
        let logs = PgActivityLogRepository::new(db);

        logs.append(entry("log-1", ActivityEventType::NoteAdded)).await.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        logs.append(entry("log-2", ActivityEventType::StatusChanged)).await.unwrap();
        logs.append(AppendActivityLogData {
            application_id: "app-foreign".to_string(),
            actor_id: "user-2".to_string(),
            ..entry("log-foreign", ActivityEventType::NoteAdded)
        })
        .await
        .unwrap();

        let listed = logs.find_all_by_user_id("user-1").await.unwrap();
        let ids: Vec<&str> = listed.iter().map(|log| log.id.as_str()).collect();
        assert_eq!(ids, vec!["log-1", "log-2"]);
    }

    #[tokio::test]
    async fn a_stored_event_type_this_build_does_not_know_is_an_error() {
        let db = seeded().await;
        sqlx::query(
            r#"INSERT INTO "ActivityLog" ("id", "applicationId", "actorId", "eventType", "payload", "createdAt")
               VALUES ('log-x', 'app-1', 'user-1', 'teleported', '{}', $1)"#,
        )
        .bind(now())
        .execute(db.pool())
        .await
        .unwrap();

        let err = PgActivityLogRepository::new(db).find_all_by_application_id("app-1").await;

        assert!(matches!(err, Err(DomainError::Internal(_))));
    }
}

mod transactions {
    use super::*;

    #[tokio::test]
    async fn commits_everything_written_inside_one() {
        let db = seeded().await;
        let notes = PgNoteRepository::new(db.clone());

        db.transaction(|| async {
            notes.create(note_data("note-1", "app-1")).await?;
            notes.create(note_data("note-2", "app-1")).await?;
            Ok(())
        })
        .await
        .unwrap();

        assert_eq!(notes.count_by_application_id("app-1").await.unwrap(), 2);
    }

    #[tokio::test]
    async fn rolls_back_everything_when_the_work_fails() {
        let db = seeded().await;
        let notes = PgNoteRepository::new(db.clone());

        let result: DomainResult<()> = db
            .transaction(|| async {
                notes.create(note_data("note-1", "app-1")).await?;
                Err(DomainError::conflict("changed my mind"))
            })
            .await;

        assert!(result.is_err());
        assert_eq!(notes.count_by_application_id("app-1").await.unwrap(), 0);
    }

    #[tokio::test]
    async fn a_nested_call_joins_the_outer_transaction() {
        let db = seeded().await;
        let notes = PgNoteRepository::new(db.clone());

        let result: DomainResult<()> = db
            .transaction(|| async {
                db.transaction(|| async { notes.create(note_data("inner", "app-1")).await })
                    .await?;
                Err(DomainError::conflict("outer fails after inner succeeded"))
            })
            .await;

        // The inner "commit" was not a commit: the outer rollback undid it.
        assert!(result.is_err());
        assert_eq!(notes.find_by_id("inner").await.unwrap(), None);
    }

    #[tokio::test]
    async fn a_read_inside_sees_the_transactions_own_writes() {
        let db = seeded().await;
        let notes = PgNoteRepository::new(db.clone());

        let seen = db
            .transaction(|| async {
                notes.create(note_data("note-1", "app-1")).await?;
                notes.count_by_application_id("app-1").await
            })
            .await
            .unwrap();

        assert_eq!(seen, 1);
    }
}

mod transaction_manager {
    use super::*;
    use trakwyn_api::infrastructure::db::transaction_manager::PgTransactionManager;
    use trakwyn_api::use_cases::ports::transaction_manager::in_transaction;

    #[tokio::test]
    async fn commits_and_returns_the_works_value() {
        let db = seeded().await;
        let notes = PgNoteRepository::new(db.clone());
        let transactions = PgTransactionManager::new(db);

        let created = in_transaction(&transactions, async {
            notes.create(note_data("note-1", "app-1")).await
        })
        .await
        .unwrap();

        assert_eq!(notes.find_by_id("note-1").await.unwrap(), Some(created));
    }

    #[tokio::test]
    async fn rolls_back_when_the_work_fails() {
        let db = seeded().await;
        let notes = PgNoteRepository::new(db.clone());
        let transactions = PgTransactionManager::new(db);

        let result: DomainResult<()> = in_transaction(&transactions, async {
            notes.create(note_data("note-1", "app-1")).await?;
            Err(DomainError::conflict("changed my mind"))
        })
        .await;

        assert!(result.is_err());
        assert_eq!(notes.find_by_id("note-1").await.unwrap(), None);
    }
}
