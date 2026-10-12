//! Repository tests for the content and profile tables, against a real
//! Postgres with the real migrations.

use std::time::Duration;

use chrono::{DateTime, TimeZone, Utc};

use trakwyn_api::domain::document_draft::DocumentDraftType;
use trakwyn_api::domain::message::MessageRole;
use trakwyn_api::domain::notification::NotificationType;
use trakwyn_api::domain::push_subscription::PushSubscriptionProvider;
use trakwyn_api::infrastructure::db::repositories::{
    PgConversationRepository, PgCookieConsentRepository, PgDocumentDraftRepository,
    PgDocumentRepository, PgEducationRepository, PgMessageRepository, PgNotificationRepository,
    PgPushSubscriptionRepository, PgSkillRepository, PgWorkExperienceRepository,
};
use trakwyn_api::infrastructure::db::Db;
use trakwyn_api::use_cases::clock::now;
use trakwyn_api::use_cases::constants::document_limits::DOCUMENTS_PER_APPLICATION;
use trakwyn_api::use_cases::errors::{DomainError, DomainResult, ErrorCode};
use trakwyn_api::use_cases::ports::{
    ConversationRepository, CookieConsentRepository, CreateConversationData,
    CreateCookieConsentData, CreateDocumentData, CreateDocumentDraftData, CreateEducationData,
    CreateMessageData, CreateNotificationData, CreateSkillData, CreateWorkExperienceData,
    DocumentDraftRepository, DocumentRepository, EducationRepository,
    FindNotificationsPagePagination, MessageRepository, NotificationRepository,
    PushSubscriptionRepository, SkillRepository, UpdateDocumentDraftContentData,
    UpdateEducationData, UpdateSkillData, UpdateWorkExperienceData, UpsertPushSubscriptionData,
    WorkExperienceRepository,
};

use crate::common::{seed_application, seed_user, TestDb};

async fn seeded() -> Db {
    let TestDb { db } = TestDb::create().await;
    seed_user(&db, "user-1").await;
    seed_application(&db, "app-1", "user-1").await;
    db
}

/// Long enough for two `now()` calls to land on different milliseconds.
async fn tick() {
    tokio::time::sleep(Duration::from_millis(5)).await;
}

fn date(year: i32, month: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(year, month, 1, 0, 0, 0).unwrap()
}

async fn trash_application(db: &Db, id: &str) {
    sqlx::query(r#"UPDATE "JobApplication" SET "deletedAt" = $2 WHERE "id" = $1"#)
        .bind(id)
        .bind(now())
        .execute(db.pool())
        .await
        .unwrap();
}

async fn document_count(db: &Db, application_id: &str) -> i32 {
    sqlx::query_scalar(r#"SELECT "documentCount" FROM "JobApplication" WHERE "id" = $1"#)
        .bind(application_id)
        .fetch_one(db.pool())
        .await
        .unwrap()
}

fn document_data(id: &str, application_id: &str) -> CreateDocumentData {
    CreateDocumentData {
        id: id.to_string(),
        application_id: application_id.to_string(),
        name: format!("{id}.pdf"),
        mime_type: "application/pdf".to_string(),
        size_bytes: 2048,
        storage_key: format!("documents/{id}"),
        ..CreateDocumentData::default()
    }
}

fn draft_data(
    id: &str,
    application_id: &str,
    draft_type: DocumentDraftType,
) -> CreateDocumentDraftData {
    CreateDocumentDraftData {
        id: id.to_string(),
        application_id: application_id.to_string(),
        draft_type,
        title: format!("title of {id}"),
        content_json: None,
        plain_text: None,
        source_document_id: None,
    }
}

mod documents {
    use super::*;

    #[tokio::test]
    async fn creates_with_the_defaults_and_reads_back() {
        let db = seeded().await;
        let documents = PgDocumentRepository::new(db.clone());

        let created = documents.create(document_data("doc-1", "app-1")).await.unwrap();

        assert_eq!(created.name, "doc-1.pdf");
        assert_eq!(created.size_bytes, 2048);
        assert_eq!(created.document_type, "other");
        assert_eq!(created.version, None);
        assert_eq!(created.source_draft_id, None);
        assert_eq!(documents.find_by_id("doc-1").await.unwrap(), Some(created));
        assert_eq!(document_count(&db, "app-1").await, 1);
    }

    #[tokio::test]
    async fn stores_the_optional_fields_when_given() {
        let documents = PgDocumentRepository::new(seeded().await);

        let created = documents
            .create(CreateDocumentData {
                document_type: Some("resume".to_string()),
                version: Some("v2".to_string()),
                ..document_data("doc-1", "app-1")
            })
            .await
            .unwrap();

        assert_eq!(created.document_type, "resume");
        assert_eq!(created.version.as_deref(), Some("v2"));
    }

    #[tokio::test]
    async fn finds_nothing_for_an_unknown_id() {
        let documents = PgDocumentRepository::new(seeded().await);
        assert_eq!(documents.find_by_id("missing").await.unwrap(), None);
    }

    #[tokio::test]
    async fn lists_and_counts_an_applications_documents_newest_first() {
        let db = seeded().await;
        seed_application(&db, "app-2", "user-1").await;
        let documents = PgDocumentRepository::new(db);

        documents.create(document_data("first", "app-1")).await.unwrap();
        tick().await;
        documents.create(document_data("second", "app-1")).await.unwrap();
        documents.create(document_data("elsewhere", "app-2")).await.unwrap();

        let listed = documents.find_all_by_application_id("app-1").await.unwrap();
        let ids: Vec<&str> = listed.iter().map(|document| document.id.as_str()).collect();
        assert_eq!(ids, vec!["second", "first"]);
        assert_eq!(documents.count_by_application_id("app-1").await.unwrap(), 2);
        assert!(documents.find_all_by_application_id("app-none").await.unwrap().is_empty());
        assert_eq!(documents.count_by_application_id("app-none").await.unwrap(), 0);
    }

    #[tokio::test]
    async fn lists_across_every_application_the_user_owns_and_no_one_elses() {
        let db = seeded().await;
        seed_application(&db, "app-2", "user-1").await;
        seed_user(&db, "user-2").await;
        seed_application(&db, "app-foreign", "user-2").await;
        let documents = PgDocumentRepository::new(db);

        documents.create(document_data("first", "app-1")).await.unwrap();
        tick().await;
        documents.create(document_data("second", "app-2")).await.unwrap();
        documents.create(document_data("foreign", "app-foreign")).await.unwrap();

        let listed = documents.find_all_by_user_id("user-1").await.unwrap();
        let ids: Vec<&str> = listed.iter().map(|document| document.id.as_str()).collect();
        assert_eq!(ids, vec!["second", "first"]);
        assert!(documents.find_all_by_user_id("user-none").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn rejects_creation_at_the_per_application_limit() {
        let db = seeded().await;
        let documents = PgDocumentRepository::new(db.clone());
        for index in 0..DOCUMENTS_PER_APPLICATION {
            documents.create(document_data(&format!("doc-{index}"), "app-1")).await.unwrap();
        }

        let err = documents.create(document_data("one-too-many", "app-1")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::QuotaExceeded);
        assert_eq!(err.to_string(), "This application already has the maximum of 10 documents");
        assert_eq!(documents.find_by_id("one-too-many").await.unwrap(), None);
        assert_eq!(document_count(&db, "app-1").await, DOCUMENTS_PER_APPLICATION);
    }

    #[tokio::test]
    async fn the_quota_is_per_application() {
        let db = seeded().await;
        seed_application(&db, "app-2", "user-1").await;
        let documents = PgDocumentRepository::new(db);
        for index in 0..DOCUMENTS_PER_APPLICATION {
            documents.create(document_data(&format!("doc-{index}"), "app-1")).await.unwrap();
        }

        documents.create(document_data("elsewhere", "app-2")).await.unwrap();
    }

    #[tokio::test]
    async fn an_unknown_application_reads_as_a_full_quota() {
        // The reservation matches no row, which `apps/api` reports the same
        // way as a full one.
        let documents = PgDocumentRepository::new(seeded().await);

        let err = documents.create(document_data("doc-1", "app-missing")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::QuotaExceeded);
    }

    #[tokio::test]
    async fn deleting_removes_the_document_and_frees_a_quota_slot() {
        let db = seeded().await;
        let documents = PgDocumentRepository::new(db.clone());
        for index in 0..DOCUMENTS_PER_APPLICATION {
            documents.create(document_data(&format!("doc-{index}"), "app-1")).await.unwrap();
        }

        documents.delete("doc-0", "app-1").await.unwrap();

        assert_eq!(documents.find_by_id("doc-0").await.unwrap(), None);
        assert_eq!(document_count(&db, "app-1").await, DOCUMENTS_PER_APPLICATION - 1);
        documents.create(document_data("fits-again", "app-1")).await.unwrap();
    }

    #[tokio::test]
    async fn deleting_an_unknown_document_leaves_the_counter_alone() {
        let db = seeded().await;
        let documents = PgDocumentRepository::new(db.clone());
        documents.create(document_data("doc-1", "app-1")).await.unwrap();

        documents.delete("missing", "app-1").await.unwrap();

        assert_eq!(document_count(&db, "app-1").await, 1);
    }

    #[tokio::test]
    async fn the_counter_never_goes_below_zero() {
        let db = seeded().await;
        let documents = PgDocumentRepository::new(db.clone());
        documents.create(document_data("doc-1", "app-1")).await.unwrap();
        sqlx::query(r#"UPDATE "JobApplication" SET "documentCount" = 0 WHERE "id" = 'app-1'"#)
            .execute(db.pool())
            .await
            .unwrap();

        documents.delete("doc-1", "app-1").await.unwrap();

        assert_eq!(document_count(&db, "app-1").await, 0);
    }

    #[tokio::test]
    async fn a_duplicate_storage_key_fails_and_gives_the_quota_slot_back() {
        let db = seeded().await;
        let documents = PgDocumentRepository::new(db.clone());
        documents.create(document_data("doc-1", "app-1")).await.unwrap();

        let duplicate = CreateDocumentData {
            storage_key: "documents/doc-1".to_string(),
            ..document_data("doc-2", "app-1")
        };
        let err = documents.create(duplicate).await;

        assert!(matches!(err, Err(DomainError::Internal(_))));
        assert_eq!(documents.find_by_id("doc-2").await.unwrap(), None);
        // The reservation and the insert are one transaction.
        assert_eq!(document_count(&db, "app-1").await, 1);
    }

    #[tokio::test]
    async fn a_create_inside_a_transaction_that_fails_is_undone_with_its_reservation() {
        let db = seeded().await;
        let documents = PgDocumentRepository::new(db.clone());

        let result: DomainResult<()> = db
            .transaction(|| async {
                documents.create(document_data("doc-1", "app-1")).await?;
                Err(DomainError::conflict("changed my mind"))
            })
            .await;

        assert!(result.is_err());
        assert_eq!(documents.find_by_id("doc-1").await.unwrap(), None);
        assert_eq!(document_count(&db, "app-1").await, 0);
    }

    #[tokio::test]
    async fn deleting_the_source_draft_nulls_the_documents_link() {
        let db = seeded().await;
        let documents = PgDocumentRepository::new(db.clone());
        let drafts = PgDocumentDraftRepository::new(db);
        drafts.create(draft_data("draft-1", "app-1", DocumentDraftType::Resume)).await.unwrap();
        let created = documents
            .create(CreateDocumentData {
                source_draft_id: Some("draft-1".to_string()),
                ..document_data("doc-1", "app-1")
            })
            .await
            .unwrap();
        assert_eq!(created.source_draft_id.as_deref(), Some("draft-1"));

        drafts.delete("draft-1").await.unwrap();

        let kept = documents.find_by_id("doc-1").await.unwrap().unwrap();
        assert_eq!(kept.source_draft_id, None);
    }

    #[tokio::test]
    async fn deleting_the_application_cascades_to_its_documents() {
        let db = seeded().await;
        let documents = PgDocumentRepository::new(db.clone());
        documents.create(document_data("doc-1", "app-1")).await.unwrap();

        sqlx::query(r#"DELETE FROM "JobApplication" WHERE "id" = 'app-1'"#)
            .execute(db.pool())
            .await
            .unwrap();

        assert_eq!(documents.find_by_id("doc-1").await.unwrap(), None);
    }
}

mod document_drafts {
    use super::*;

    #[tokio::test]
    async fn creates_with_the_defaults_and_reads_back() {
        let drafts = PgDocumentDraftRepository::new(seeded().await);

        let created = drafts
            .create(draft_data("draft-1", "app-1", DocumentDraftType::CoverLetter))
            .await
            .unwrap();

        assert_eq!(created.draft_type, DocumentDraftType::CoverLetter);
        assert_eq!(created.content_json, "{}");
        assert_eq!(created.plain_text, "");
        assert_eq!(created.source_document_id, None);
        assert_eq!(created.created_at, created.updated_at);
        assert_eq!(drafts.find_by_id("draft-1").await.unwrap(), Some(created));
    }

    #[tokio::test]
    async fn stores_the_content_when_given() {
        let drafts = PgDocumentDraftRepository::new(seeded().await);

        let created = drafts
            .create(CreateDocumentDraftData {
                content_json: Some(r#"{"type":"doc"}"#.to_string()),
                plain_text: Some("Dear hiring manager".to_string()),
                ..draft_data("draft-1", "app-1", DocumentDraftType::Resume)
            })
            .await
            .unwrap();

        assert_eq!(created.draft_type, DocumentDraftType::Resume);
        assert_eq!(created.content_json, r#"{"type":"doc"}"#);
        assert_eq!(created.plain_text, "Dear hiring manager");
    }

    #[tokio::test]
    async fn finds_nothing_for_an_unknown_id() {
        let drafts = PgDocumentDraftRepository::new(seeded().await);
        assert_eq!(drafts.find_by_id("missing").await.unwrap(), None);
    }

    #[tokio::test]
    async fn lists_and_counts_an_applications_drafts_most_recently_updated_first() {
        let db = seeded().await;
        seed_application(&db, "app-2", "user-1").await;
        let drafts = PgDocumentDraftRepository::new(db);

        drafts.create(draft_data("first", "app-1", DocumentDraftType::Resume)).await.unwrap();
        tick().await;
        drafts.create(draft_data("second", "app-1", DocumentDraftType::CoverLetter)).await.unwrap();
        drafts.create(draft_data("elsewhere", "app-2", DocumentDraftType::Resume)).await.unwrap();
        tick().await;
        // Editing the older draft moves it to the top.
        drafts.rename("first", "Renamed").await.unwrap();

        let listed = drafts.find_all_by_application_id("app-1").await.unwrap();
        let ids: Vec<&str> = listed.iter().map(|draft| draft.id.as_str()).collect();
        assert_eq!(ids, vec!["first", "second"]);
        assert_eq!(drafts.count_by_application_id("app-1").await.unwrap(), 2);
        assert_eq!(drafts.count_by_application_id("app-none").await.unwrap(), 0);
    }

    #[tokio::test]
    async fn updating_the_content_leaves_the_title_and_moves_updated_at() {
        let drafts = PgDocumentDraftRepository::new(seeded().await);
        let created =
            drafts.create(draft_data("draft-1", "app-1", DocumentDraftType::Resume)).await.unwrap();
        tick().await;

        let updated = drafts
            .update_content(
                "draft-1",
                UpdateDocumentDraftContentData {
                    content_json: r#"{"type":"doc"}"#.to_string(),
                    plain_text: "Rewritten".to_string(),
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.content_json, r#"{"type":"doc"}"#);
        assert_eq!(updated.plain_text, "Rewritten");
        assert_eq!(updated.title, created.title);
        assert_eq!(updated.created_at, created.created_at);
        assert!(updated.updated_at > created.updated_at);
        assert_eq!(drafts.find_by_id("draft-1").await.unwrap(), Some(updated));
    }

    #[tokio::test]
    async fn renaming_changes_the_title_leaves_the_content_and_moves_updated_at() {
        let drafts = PgDocumentDraftRepository::new(seeded().await);
        let created = drafts
            .create(CreateDocumentDraftData {
                plain_text: Some("Body".to_string()),
                ..draft_data("draft-1", "app-1", DocumentDraftType::Resume)
            })
            .await
            .unwrap();
        tick().await;

        let renamed = drafts.rename("draft-1", "Senior Engineer resume").await.unwrap();

        assert_eq!(renamed.title, "Senior Engineer resume");
        assert_eq!(renamed.plain_text, "Body");
        assert_eq!(renamed.content_json, created.content_json);
        assert!(renamed.updated_at > created.updated_at);
    }

    #[tokio::test]
    async fn updating_a_missing_draft_is_an_internal_error() {
        let drafts = PgDocumentDraftRepository::new(seeded().await);
        assert!(matches!(drafts.rename("missing", "x").await, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn deletes_a_draft() {
        let drafts = PgDocumentDraftRepository::new(seeded().await);
        drafts.create(draft_data("draft-1", "app-1", DocumentDraftType::Resume)).await.unwrap();

        drafts.delete("draft-1").await.unwrap();

        assert_eq!(drafts.find_by_id("draft-1").await.unwrap(), None);
    }

    #[tokio::test]
    async fn deleting_the_source_document_nulls_the_drafts_link() {
        let db = seeded().await;
        let documents = PgDocumentRepository::new(db.clone());
        let drafts = PgDocumentDraftRepository::new(db);
        documents.create(document_data("doc-1", "app-1")).await.unwrap();
        let created = drafts
            .create(CreateDocumentDraftData {
                source_document_id: Some("doc-1".to_string()),
                ..draft_data("draft-1", "app-1", DocumentDraftType::Resume)
            })
            .await
            .unwrap();
        assert_eq!(created.source_document_id.as_deref(), Some("doc-1"));

        documents.delete("doc-1", "app-1").await.unwrap();

        let kept = drafts.find_by_id("draft-1").await.unwrap().unwrap();
        assert_eq!(kept.source_document_id, None);
    }

    #[tokio::test]
    async fn recent_cover_letters_skip_resumes_and_excluded_trashed_and_foreign_applications() {
        let db = seeded().await;
        seed_application(&db, "app-other", "user-1").await;
        seed_application(&db, "app-trashed", "user-1").await;
        seed_user(&db, "user-2").await;
        seed_application(&db, "app-foreign", "user-2").await;
        trash_application(&db, "app-trashed").await;
        let drafts = PgDocumentDraftRepository::new(db);
        for (id, application_id, draft_type) in [
            ("current", "app-1", DocumentDraftType::CoverLetter),
            ("wanted", "app-other", DocumentDraftType::CoverLetter),
            ("resume", "app-other", DocumentDraftType::Resume),
            ("trashed", "app-trashed", DocumentDraftType::CoverLetter),
            ("foreign", "app-foreign", DocumentDraftType::CoverLetter),
        ] {
            drafts.create(draft_data(id, application_id, draft_type)).await.unwrap();
        }

        let recent = drafts
            .find_recent_cover_letters_by_user_excluding_application("user-1", "app-1", 10)
            .await
            .unwrap();

        let ids: Vec<&str> = recent.iter().map(|draft| draft.id.as_str()).collect();
        assert_eq!(ids, vec!["wanted"]);
    }

    #[tokio::test]
    async fn recent_cover_letters_come_newest_first_up_to_the_limit() {
        let db = seeded().await;
        seed_application(&db, "app-other", "user-1").await;
        let drafts = PgDocumentDraftRepository::new(db);
        for id in ["oldest", "middle", "newest"] {
            drafts
                .create(draft_data(id, "app-other", DocumentDraftType::CoverLetter))
                .await
                .unwrap();
            tick().await;
        }

        let recent = drafts
            .find_recent_cover_letters_by_user_excluding_application("user-1", "app-1", 2)
            .await
            .unwrap();

        let ids: Vec<&str> = recent.iter().map(|draft| draft.id.as_str()).collect();
        assert_eq!(ids, vec!["newest", "middle"]);
    }

    #[tokio::test]
    async fn a_stored_type_this_build_does_not_know_is_an_error() {
        let db = seeded().await;
        sqlx::query(
            r#"INSERT INTO "DocumentDraft" ("id", "applicationId", "type", "title", "createdAt", "updatedAt")
               VALUES ('draft-x', 'app-1', 'portfolio', 'Odd', $1, $1)"#,
        )
        .bind(now())
        .execute(db.pool())
        .await
        .unwrap();

        let err = PgDocumentDraftRepository::new(db).find_by_id("draft-x").await;

        assert!(matches!(err, Err(DomainError::Internal(_))));
    }
}

fn conversation_data(id: &str, user_id: &str) -> CreateConversationData {
    CreateConversationData {
        id: id.to_string(),
        user_id: user_id.to_string(),
        ..CreateConversationData::default()
    }
}

fn message_data(id: &str, conversation_id: &str, content: &str) -> CreateMessageData {
    CreateMessageData {
        id: id.to_string(),
        conversation_id: conversation_id.to_string(),
        role: MessageRole::User,
        content: content.to_string(),
        tool_trace: None,
    }
}

mod conversations {
    use super::*;

    #[tokio::test]
    async fn creates_with_a_null_title_and_reads_back() {
        let conversations = PgConversationRepository::new(seeded().await);

        let created = conversations.create(conversation_data("conv-1", "user-1")).await.unwrap();

        assert_eq!(created.title, None);
        assert_eq!(created.llm_provider, None);
        assert_eq!(created.llm_model, None);
        assert_eq!(created.created_at, created.updated_at);
        assert_eq!(conversations.find_by_id("conv-1").await.unwrap(), Some(created));
    }

    #[tokio::test]
    async fn stores_the_provider_and_model_chosen_at_creation() {
        let conversations = PgConversationRepository::new(seeded().await);

        let created = conversations
            .create(CreateConversationData {
                llm_provider: Some("anthropic".to_string()),
                llm_model: Some("claude".to_string()),
                ..conversation_data("conv-1", "user-1")
            })
            .await
            .unwrap();

        assert_eq!(created.llm_provider.as_deref(), Some("anthropic"));
        assert_eq!(created.llm_model.as_deref(), Some("claude"));
    }

    #[tokio::test]
    async fn finds_nothing_for_an_unknown_id() {
        let conversations = PgConversationRepository::new(seeded().await);
        assert_eq!(conversations.find_by_id("missing").await.unwrap(), None);
    }

    #[tokio::test]
    async fn lists_a_users_conversations_most_recently_updated_first() {
        let db = seeded().await;
        seed_user(&db, "user-2").await;
        let conversations = PgConversationRepository::new(db);
        for id in ["first", "second", "third"] {
            conversations.create(conversation_data(id, "user-1")).await.unwrap();
            tick().await;
        }
        conversations.create(conversation_data("foreign", "user-2")).await.unwrap();
        // A retitle is an update, so it moves the oldest to the top.
        conversations.update_title("first", "Retitled").await.unwrap();

        let listed = conversations.find_all_by_user_id("user-1", None).await.unwrap();
        let ids: Vec<&str> = listed.iter().map(|conversation| conversation.id.as_str()).collect();
        assert_eq!(ids, vec!["first", "third", "second"]);
    }

    #[tokio::test]
    async fn a_limit_bounds_the_list_and_a_negative_one_does_not() {
        let conversations = PgConversationRepository::new(seeded().await);
        for id in ["first", "second", "third"] {
            conversations.create(conversation_data(id, "user-1")).await.unwrap();
            tick().await;
        }

        let bounded = conversations.find_all_by_user_id("user-1", Some(2)).await.unwrap();
        let ids: Vec<&str> = bounded.iter().map(|conversation| conversation.id.as_str()).collect();
        assert_eq!(ids, vec!["third", "second"]);
        assert_eq!(conversations.find_all_by_user_id("user-1", Some(-1)).await.unwrap().len(), 3);
        assert!(conversations.find_all_by_user_id("user-1", Some(0)).await.unwrap().is_empty());
    }

    /// Three conversations for user-1 (one matching by title, one by message
    /// content, one not at all) and one for user-2 that would match.
    async fn searchable() -> PgConversationRepository {
        let db = seeded().await;
        seed_user(&db, "user-2").await;
        let conversations = PgConversationRepository::new(db.clone());
        let messages = PgMessageRepository::new(db);
        for (id, user_id) in [
            ("by-title", "user-1"),
            ("by-content", "user-1"),
            ("neither", "user-1"),
            ("foreign", "user-2"),
        ] {
            conversations.create(conversation_data(id, user_id)).await.unwrap();
            tick().await;
        }
        conversations.update_title("by-title", "Salary Negotiation tips").await.unwrap();
        tick().await;
        conversations.update_title("by-content", "Interview prep").await.unwrap();
        conversations.update_title("neither", "100% unrelated").await.unwrap();
        conversations.update_title("foreign", "negotiation for someone else").await.unwrap();
        messages
            .create(message_data("m1", "by-content", "How do I open a negotiation?"))
            .await
            .unwrap();
        messages.create(message_data("m2", "foreign", "negotiation")).await.unwrap();
        conversations
    }

    async fn search(conversations: &PgConversationRepository, term: &str) -> Vec<String> {
        conversations
            .search_by_user_id("user-1", term)
            .await
            .unwrap()
            .into_iter()
            .map(|conversation| conversation.id)
            .collect()
    }

    #[tokio::test]
    async fn search_matches_titles_and_message_contents_most_recently_updated_first() {
        let conversations = searchable().await;
        // by-content was retitled after by-title, so it is the newer update.
        assert_eq!(search(&conversations, "negotiation").await, vec!["by-content", "by-title"]);
    }

    #[tokio::test]
    async fn search_is_case_insensitive() {
        let conversations = searchable().await;
        assert_eq!(search(&conversations, "SALARY").await, vec!["by-title"]);
        assert_eq!(search(&conversations, "OPEN A").await, vec!["by-content"]);
    }

    #[tokio::test]
    async fn search_never_returns_another_users_conversations() {
        let conversations = searchable().await;
        assert!(search(&conversations, "someone else").await.is_empty());
    }

    #[tokio::test]
    async fn search_treats_like_wildcards_literally() {
        let conversations = searchable().await;
        assert_eq!(search(&conversations, "100%").await, vec!["neither"]);
        // As wildcards these would match every title.
        assert!(search(&conversations, "1_0").await.is_empty());
        assert!(search(&conversations, "%x%").await.is_empty());
        assert!(search(&conversations, r"\").await.is_empty());
    }

    #[tokio::test]
    async fn an_untitled_conversation_is_found_by_its_messages_only() {
        let db = seeded().await;
        let conversations = PgConversationRepository::new(db.clone());
        conversations.create(conversation_data("untitled", "user-1")).await.unwrap();
        assert!(search(&conversations, "hello").await.is_empty());

        PgMessageRepository::new(db)
            .create(message_data("m1", "untitled", "Hello there"))
            .await
            .unwrap();

        assert_eq!(search(&conversations, "hello").await, vec!["untitled"]);
    }

    #[tokio::test]
    async fn updating_the_title_moves_updated_at() {
        let conversations = PgConversationRepository::new(seeded().await);
        let created = conversations.create(conversation_data("conv-1", "user-1")).await.unwrap();
        tick().await;

        conversations.update_title("conv-1", "Offer comparison").await.unwrap();

        let updated = conversations.find_by_id("conv-1").await.unwrap().unwrap();
        assert_eq!(updated.title.as_deref(), Some("Offer comparison"));
        assert_eq!(updated.created_at, created.created_at);
        assert!(updated.updated_at > created.updated_at);
    }

    #[tokio::test]
    async fn locks_in_the_provider_with_or_without_a_model() {
        let conversations = PgConversationRepository::new(seeded().await);
        conversations.create(conversation_data("conv-1", "user-1")).await.unwrap();

        conversations.update_llm_settings("conv-1", "openai", Some("gpt")).await.unwrap();
        let with_model = conversations.find_by_id("conv-1").await.unwrap().unwrap();
        assert_eq!(with_model.llm_provider.as_deref(), Some("openai"));
        assert_eq!(with_model.llm_model.as_deref(), Some("gpt"));

        conversations.update_llm_settings("conv-1", "custom", None).await.unwrap();
        let without_model = conversations.find_by_id("conv-1").await.unwrap().unwrap();
        assert_eq!(without_model.llm_provider.as_deref(), Some("custom"));
        assert_eq!(without_model.llm_model, None);
    }

    #[tokio::test]
    async fn deleting_cascades_to_the_conversations_messages() {
        let db = seeded().await;
        let conversations = PgConversationRepository::new(db.clone());
        let messages = PgMessageRepository::new(db);
        conversations.create(conversation_data("conv-1", "user-1")).await.unwrap();
        messages.create(message_data("m1", "conv-1", "hello")).await.unwrap();

        conversations.delete("conv-1").await.unwrap();

        assert_eq!(conversations.find_by_id("conv-1").await.unwrap(), None);
        assert!(messages.find_all_by_conversation_id("conv-1").await.unwrap().is_empty());
    }
}

mod messages {
    use super::*;

    async fn with_conversations() -> PgMessageRepository {
        let db = seeded().await;
        let conversations = PgConversationRepository::new(db.clone());
        conversations.create(conversation_data("conv-1", "user-1")).await.unwrap();
        conversations.create(conversation_data("conv-2", "user-1")).await.unwrap();
        PgMessageRepository::new(db)
    }

    #[tokio::test]
    async fn creates_a_message_and_reads_it_back() {
        let messages = with_conversations().await;

        let created = messages.create(message_data("m1", "conv-1", "Hello")).await.unwrap();

        assert_eq!(created.role, MessageRole::User);
        assert_eq!(created.content, "Hello");
        assert_eq!(created.tool_trace, None);
        assert_eq!(messages.find_all_by_conversation_id("conv-1").await.unwrap(), vec![created]);
    }

    #[tokio::test]
    async fn stores_an_assistant_replys_tool_trace() {
        let messages = with_conversations().await;

        let created = messages
            .create(CreateMessageData {
                role: MessageRole::Assistant,
                tool_trace: Some("list_applications → app-1 Acme/Engineer".to_string()),
                ..message_data("m1", "conv-1", "You have one application.")
            })
            .await
            .unwrap();

        assert_eq!(created.role, MessageRole::Assistant);
        let stored = messages.find_all_by_conversation_id("conv-1").await.unwrap();
        assert_eq!(
            stored[0].tool_trace.as_deref(),
            Some("list_applications → app-1 Acme/Engineer")
        );
    }

    #[tokio::test]
    async fn lists_a_conversations_messages_oldest_first() {
        let messages = with_conversations().await;
        messages.create(message_data("first", "conv-1", "one")).await.unwrap();
        tick().await;
        messages.create(message_data("second", "conv-1", "two")).await.unwrap();
        messages.create(message_data("elsewhere", "conv-2", "three")).await.unwrap();

        let listed = messages.find_all_by_conversation_id("conv-1").await.unwrap();

        let ids: Vec<&str> = listed.iter().map(|message| message.id.as_str()).collect();
        assert_eq!(ids, vec!["first", "second"]);
    }

    #[tokio::test]
    async fn a_conversation_without_messages_lists_none() {
        let messages = with_conversations().await;
        assert!(messages.find_all_by_conversation_id("conv-1").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_stored_role_this_build_does_not_know_is_an_error() {
        let db = seeded().await;
        PgConversationRepository::new(db.clone())
            .create(conversation_data("conv-1", "user-1"))
            .await
            .unwrap();
        sqlx::query(
            r#"INSERT INTO "Message" ("id", "conversationId", "role", "content", "createdAt")
               VALUES ('m-x', 'conv-1', 'system', 'x', $1)"#,
        )
        .bind(now())
        .execute(db.pool())
        .await
        .unwrap();

        let err = PgMessageRepository::new(db).find_all_by_conversation_id("conv-1").await;

        assert!(matches!(err, Err(DomainError::Internal(_))));
    }
}

fn notification_data(id: &str, user_id: &str) -> CreateNotificationData {
    CreateNotificationData {
        id: id.to_string(),
        user_id: user_id.to_string(),
        notification_type: NotificationType::InterviewReminder,
        title: format!("title of {id}"),
        body: "Acme, 10:00".to_string(),
        url: None,
    }
}

fn page(cursor: Option<&str>, limit: i64) -> FindNotificationsPagePagination {
    FindNotificationsPagePagination { cursor: cursor.map(str::to_string), limit }
}

mod notifications {
    use super::*;

    /// Follows the cursor until the last page, returning each page's ids.
    async fn walk(
        notifications: &PgNotificationRepository,
        user_id: &str,
        limit: i64,
    ) -> Vec<Vec<String>> {
        let mut pages = Vec::new();
        let mut cursor: Option<String> = None;
        loop {
            let found = notifications
                .find_page_by_user_id(user_id, page(cursor.as_deref(), limit))
                .await
                .unwrap();
            let ids: Vec<String> = found.items.iter().map(|item| item.id.clone()).collect();
            cursor = ids.last().cloned();
            pages.push(ids);
            if !found.has_next_page {
                return pages;
            }
        }
    }

    #[tokio::test]
    async fn creates_an_unread_notification() {
        let db = seeded().await;
        let notifications = PgNotificationRepository::new(db);

        let created = notifications
            .create(CreateNotificationData {
                notification_type: NotificationType::SecurityAlert,
                url: Some("/settings/security".to_string()),
                ..notification_data("n1", "user-1")
            })
            .await
            .unwrap();

        assert_eq!(created.notification_type, NotificationType::SecurityAlert);
        assert_eq!(created.url.as_deref(), Some("/settings/security"));
        assert_eq!(created.read_at, None);
        let found = notifications.find_page_by_user_id("user-1", page(None, 10)).await.unwrap();
        assert_eq!(found.items, vec![created]);
        assert!(!found.has_next_page);
    }

    #[tokio::test]
    async fn the_url_is_null_when_omitted() {
        let notifications = PgNotificationRepository::new(seeded().await);
        let created = notifications.create(notification_data("n1", "user-1")).await.unwrap();
        assert_eq!(created.url, None);
    }

    #[tokio::test]
    async fn pages_newest_first_with_no_gaps_or_repeats() {
        let notifications = PgNotificationRepository::new(seeded().await);
        for id in ["n1", "n2", "n3", "n4", "n5"] {
            notifications.create(notification_data(id, "user-1")).await.unwrap();
            tick().await;
        }

        let pages = walk(&notifications, "user-1", 2).await;

        assert_eq!(pages, vec![vec!["n5", "n4"], vec!["n3", "n2"], vec!["n1"]]);
    }

    #[tokio::test]
    async fn pages_by_id_when_every_row_shares_a_timestamp() {
        let db = seeded().await;
        let shared = now();
        for id in ["n1", "n2", "n3", "n4", "n5"] {
            sqlx::query(
                r#"INSERT INTO "Notification" ("id", "userId", "type", "title", "body", "createdAt")
                   VALUES ($1, 'user-1', 'follow_up_reminder', 't', 'b', $2)"#,
            )
            .bind(id)
            .bind(shared)
            .execute(db.pool())
            .await
            .unwrap();
        }
        let notifications = PgNotificationRepository::new(db);

        let pages = walk(&notifications, "user-1", 2).await;

        assert_eq!(pages, vec![vec!["n5", "n4"], vec!["n3", "n2"], vec!["n1"]]);
    }

    #[tokio::test]
    async fn a_full_last_page_reports_no_next_page() {
        let notifications = PgNotificationRepository::new(seeded().await);
        for id in ["n1", "n2"] {
            notifications.create(notification_data(id, "user-1")).await.unwrap();
            tick().await;
        }

        let found = notifications.find_page_by_user_id("user-1", page(None, 2)).await.unwrap();

        assert_eq!(found.items.len(), 2);
        assert!(!found.has_next_page);
    }

    #[tokio::test]
    async fn an_unknown_or_empty_cursor_starts_from_the_newest() {
        let notifications = PgNotificationRepository::new(seeded().await);
        notifications.create(notification_data("n1", "user-1")).await.unwrap();

        for cursor in [Some("gone"), Some("")] {
            let found =
                notifications.find_page_by_user_id("user-1", page(cursor, 5)).await.unwrap();
            assert_eq!(found.items.len(), 1);
        }
    }

    #[tokio::test]
    async fn a_page_holds_only_the_given_users_notifications() {
        let db = seeded().await;
        seed_user(&db, "user-2").await;
        let notifications = PgNotificationRepository::new(db);
        notifications.create(notification_data("mine", "user-1")).await.unwrap();
        notifications.create(notification_data("theirs", "user-2")).await.unwrap();

        let pages = walk(&notifications, "user-1", 10).await;

        assert_eq!(pages, vec![vec!["mine"]]);
    }

    #[tokio::test]
    async fn marks_notifications_read_and_back_counting_only_what_changed() {
        let notifications = PgNotificationRepository::new(seeded().await);
        for id in ["n1", "n2", "n3"] {
            notifications.create(notification_data(id, "user-1")).await.unwrap();
        }
        let ids = ["n1", "n2", "n3"].map(str::to_string);

        assert_eq!(
            notifications.mark_many_read_for_user("user-1", &ids[..2], true).await.unwrap(),
            2
        );
        assert_eq!(notifications.count_unread_for_user("user-1").await.unwrap(), 1);
        let found = notifications.find_page_by_user_id("user-1", page(None, 10)).await.unwrap();
        let read: Vec<bool> = {
            let mut items = found.items;
            items.sort_by(|a, b| a.id.cmp(&b.id));
            items.iter().map(|item| item.read_at.is_some()).collect()
        };
        assert_eq!(read, vec![true, true, false]);

        // n1 and n2 are already read: only n3 changes.
        assert_eq!(notifications.mark_many_read_for_user("user-1", &ids, true).await.unwrap(), 1);

        assert_eq!(
            notifications.mark_many_read_for_user("user-1", &ids[..1], false).await.unwrap(),
            1
        );
        // Already unread: nothing to change.
        assert_eq!(
            notifications.mark_many_read_for_user("user-1", &ids[..1], false).await.unwrap(),
            0
        );
        assert_eq!(notifications.count_unread_for_user("user-1").await.unwrap(), 1);
    }

    #[tokio::test]
    async fn marking_ignores_another_users_notifications_and_an_empty_list() {
        let db = seeded().await;
        seed_user(&db, "user-2").await;
        let notifications = PgNotificationRepository::new(db);
        notifications.create(notification_data("mine", "user-1")).await.unwrap();
        notifications.create(notification_data("theirs", "user-2")).await.unwrap();
        let ids = ["mine", "theirs"].map(str::to_string);

        assert_eq!(notifications.mark_many_read_for_user("user-1", &ids, true).await.unwrap(), 1);
        assert_eq!(notifications.count_unread_for_user("user-2").await.unwrap(), 1);
        assert_eq!(notifications.mark_many_read_for_user("user-2", &[], true).await.unwrap(), 0);
    }

    #[tokio::test]
    async fn counts_zero_unread_for_a_user_with_no_notifications() {
        let notifications = PgNotificationRepository::new(seeded().await);
        assert_eq!(notifications.count_unread_for_user("user-1").await.unwrap(), 0);
    }

    #[tokio::test]
    async fn deleting_the_user_cascades_to_their_notifications() {
        let db = seeded().await;
        let notifications = PgNotificationRepository::new(db.clone());
        notifications.create(notification_data("n1", "user-1")).await.unwrap();

        sqlx::query(r#"DELETE FROM "User" WHERE "id" = 'user-1'"#)
            .execute(db.pool())
            .await
            .unwrap();

        let remaining: i64 = sqlx::query_scalar(r#"SELECT count(*) FROM "Notification""#)
            .fetch_one(db.pool())
            .await
            .unwrap();
        assert_eq!(remaining, 0);
    }
}

fn subscription_data(id: &str, user_id: &str, endpoint: &str) -> UpsertPushSubscriptionData {
    UpsertPushSubscriptionData {
        id: id.to_string(),
        user_id: user_id.to_string(),
        provider: PushSubscriptionProvider::Web,
        endpoint: endpoint.to_string(),
        p256dh: Some(format!("p256dh-{id}")),
        auth: Some(format!("auth-{id}")),
    }
}

mod push_subscriptions {
    use super::*;

    #[tokio::test]
    async fn inserts_a_new_subscription_and_reads_it_back() {
        let subscriptions = PgPushSubscriptionRepository::new(seeded().await);

        let created = subscriptions
            .upsert(subscription_data("sub-1", "user-1", "https://push.example/a"))
            .await
            .unwrap();

        assert_eq!(created.created_at, created.updated_at);
        assert_eq!(
            subscriptions.find_by_endpoint("https://push.example/a").await.unwrap(),
            Some(created.clone())
        );
        assert_eq!(subscriptions.find_by_user_id("user-1").await.unwrap(), vec![created]);
    }

    #[tokio::test]
    async fn stores_an_expo_token_without_key_material() {
        let subscriptions = PgPushSubscriptionRepository::new(seeded().await);

        subscriptions
            .upsert(UpsertPushSubscriptionData {
                provider: PushSubscriptionProvider::Expo,
                p256dh: None,
                auth: None,
                ..subscription_data("sub-1", "user-1", "ExponentPushToken[abc]")
            })
            .await
            .unwrap();

        let stored =
            subscriptions.find_by_endpoint("ExponentPushToken[abc]").await.unwrap().unwrap();
        assert_eq!(stored.provider, PushSubscriptionProvider::Expo);
        assert_eq!(stored.p256dh, None);
        assert_eq!(stored.auth, None);
    }

    #[tokio::test]
    async fn finds_nothing_for_an_unknown_endpoint_or_user() {
        let subscriptions = PgPushSubscriptionRepository::new(seeded().await);
        assert_eq!(
            subscriptions.find_by_endpoint("https://push.example/none").await.unwrap(),
            None
        );
        assert!(subscriptions.find_by_user_id("user-1").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn an_upsert_on_a_stored_endpoint_repoints_the_one_row() {
        let db = seeded().await;
        seed_user(&db, "user-2").await;
        let subscriptions = PgPushSubscriptionRepository::new(db);
        let endpoint = "https://push.example/shared";
        let first =
            subscriptions.upsert(subscription_data("sub-1", "user-1", endpoint)).await.unwrap();
        tick().await;

        let echoed = subscriptions
            .upsert(UpsertPushSubscriptionData {
                provider: PushSubscriptionProvider::Expo,
                ..subscription_data("sub-2", "user-2", endpoint)
            })
            .await
            .unwrap();

        // The return value echoes the input...
        assert_eq!(echoed.id, "sub-2");
        assert_eq!(echoed.created_at, echoed.updated_at);
        // ...while the stored row keeps its id and createdAt and takes the rest.
        let stored = subscriptions.find_by_endpoint(endpoint).await.unwrap().unwrap();
        assert_eq!(stored.id, "sub-1");
        assert_eq!(stored.created_at, first.created_at);
        assert_eq!(stored.updated_at, echoed.updated_at);
        assert!(stored.updated_at > first.updated_at);
        assert_eq!(stored.user_id, "user-2");
        assert_eq!(stored.provider, PushSubscriptionProvider::Expo);
        assert_eq!(stored.p256dh.as_deref(), Some("p256dh-sub-2"));
        assert_eq!(stored.auth.as_deref(), Some("auth-sub-2"));
        assert!(subscriptions.find_by_user_id("user-1").await.unwrap().is_empty());
        assert_eq!(subscriptions.find_by_user_id("user-2").await.unwrap(), vec![stored]);
    }

    #[tokio::test]
    async fn deletes_by_endpoint() {
        let subscriptions = PgPushSubscriptionRepository::new(seeded().await);
        subscriptions
            .upsert(subscription_data("sub-1", "user-1", "https://push.example/a"))
            .await
            .unwrap();
        subscriptions
            .upsert(subscription_data("sub-2", "user-1", "https://push.example/b"))
            .await
            .unwrap();

        subscriptions.delete_by_endpoint("https://push.example/a").await.unwrap();

        let left = subscriptions.find_by_user_id("user-1").await.unwrap();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].id, "sub-2");
    }

    #[tokio::test]
    async fn deletes_every_subscription_of_a_user_and_no_one_elses() {
        let db = seeded().await;
        seed_user(&db, "user-2").await;
        let subscriptions = PgPushSubscriptionRepository::new(db);
        subscriptions
            .upsert(subscription_data("sub-1", "user-1", "https://push.example/a"))
            .await
            .unwrap();
        subscriptions
            .upsert(subscription_data("sub-2", "user-1", "https://push.example/b"))
            .await
            .unwrap();
        subscriptions
            .upsert(subscription_data("sub-3", "user-2", "https://push.example/c"))
            .await
            .unwrap();

        subscriptions.delete_by_user_id("user-1").await.unwrap();

        assert!(subscriptions.find_by_user_id("user-1").await.unwrap().is_empty());
        assert_eq!(subscriptions.find_by_user_id("user-2").await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn runs_outside_an_ambient_transaction() {
        // `apps/api`'s repository bypasses the transaction context, so its
        // write survives the rollback of a transaction it was called in.
        let db = seeded().await;
        let subscriptions = PgPushSubscriptionRepository::new(db.clone());

        let result: DomainResult<()> = db
            .transaction(|| async {
                subscriptions
                    .upsert(subscription_data("sub-1", "user-1", "https://push.example/a"))
                    .await?;
                Err(DomainError::conflict("changed my mind"))
            })
            .await;

        assert!(result.is_err());
        assert_eq!(subscriptions.find_by_user_id("user-1").await.unwrap().len(), 1);
    }
}

fn education_data(id: &str, user_id: &str, start_date: DateTime<Utc>) -> CreateEducationData {
    CreateEducationData {
        id: id.to_string(),
        user_id: user_id.to_string(),
        institution: format!("institution of {id}"),
        degree: Some("BSc".to_string()),
        field: Some("Computer Science".to_string()),
        start_date,
        end_date: Some(date(2020, 6)),
        description: Some("First class".to_string()),
    }
}

mod educations {
    use super::*;

    #[tokio::test]
    async fn creates_and_reads_back() {
        let educations = PgEducationRepository::new(seeded().await);

        let created =
            educations.create(education_data("edu-1", "user-1", date(2016, 9))).await.unwrap();

        assert_eq!(created.institution, "institution of edu-1");
        assert_eq!(created.start_date, date(2016, 9));
        assert_eq!(created.end_date, Some(date(2020, 6)));
        assert_eq!(created.created_at, created.updated_at);
        assert_eq!(educations.find_by_id("edu-1").await.unwrap(), Some(created));
    }

    #[tokio::test]
    async fn stores_nulls_for_the_optional_fields() {
        let educations = PgEducationRepository::new(seeded().await);

        let created = educations
            .create(CreateEducationData {
                degree: None,
                field: None,
                end_date: None,
                description: None,
                ..education_data("edu-1", "user-1", date(2016, 9))
            })
            .await
            .unwrap();

        assert_eq!(
            (created.degree, created.field, created.end_date, created.description),
            (None, None, None, None)
        );
    }

    #[tokio::test]
    async fn finds_nothing_for_an_unknown_id() {
        let educations = PgEducationRepository::new(seeded().await);
        assert_eq!(educations.find_by_id("missing").await.unwrap(), None);
    }

    #[tokio::test]
    async fn lists_a_users_entries_latest_start_first_then_by_id_descending() {
        let db = seeded().await;
        seed_user(&db, "user-2").await;
        let educations = PgEducationRepository::new(db);
        for (id, user_id, start_date) in [
            ("old", "user-1", date(2010, 9)),
            ("tie-a", "user-1", date(2016, 9)),
            ("tie-b", "user-1", date(2016, 9)),
            ("new", "user-1", date(2021, 9)),
            ("foreign", "user-2", date(2022, 9)),
        ] {
            educations.create(education_data(id, user_id, start_date)).await.unwrap();
        }

        let listed = educations.find_all_by_user_id("user-1").await.unwrap();

        let ids: Vec<&str> = listed.iter().map(|education| education.id.as_str()).collect();
        assert_eq!(ids, vec!["new", "tie-b", "tie-a", "old"]);
    }

    #[tokio::test]
    async fn an_update_changes_only_what_it_names_and_moves_updated_at() {
        let educations = PgEducationRepository::new(seeded().await);
        let created =
            educations.create(education_data("edu-1", "user-1", date(2016, 9))).await.unwrap();
        tick().await;

        let updated = educations
            .update(
                "edu-1",
                UpdateEducationData {
                    institution: Some("MIT".to_string()),
                    degree: Some(None),
                    start_date: Some(date(2017, 9)),
                    end_date: Some(None),
                    ..UpdateEducationData::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.institution, "MIT");
        assert_eq!(updated.degree, None);
        assert_eq!(updated.start_date, date(2017, 9));
        assert_eq!(updated.end_date, None);
        // Left alone.
        assert_eq!(updated.field, created.field);
        assert_eq!(updated.description, created.description);
        assert_eq!(updated.created_at, created.created_at);
        assert!(updated.updated_at > created.updated_at);
        assert_eq!(educations.find_by_id("edu-1").await.unwrap(), Some(updated));
    }

    #[tokio::test]
    async fn an_update_can_set_every_nullable_field() {
        let educations = PgEducationRepository::new(seeded().await);
        educations.create(education_data("edu-1", "user-1", date(2016, 9))).await.unwrap();

        let updated = educations
            .update(
                "edu-1",
                UpdateEducationData {
                    field: Some(Some("Mathematics".to_string())),
                    description: Some(None),
                    end_date: Some(Some(date(2021, 6))),
                    ..UpdateEducationData::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.field.as_deref(), Some("Mathematics"));
        assert_eq!(updated.description, None);
        assert_eq!(updated.end_date, Some(date(2021, 6)));
    }

    #[tokio::test]
    async fn an_empty_update_only_moves_updated_at() {
        let educations = PgEducationRepository::new(seeded().await);
        let created =
            educations.create(education_data("edu-1", "user-1", date(2016, 9))).await.unwrap();
        tick().await;

        let updated = educations.update("edu-1", UpdateEducationData::default()).await.unwrap();

        assert!(updated.updated_at > created.updated_at);
        assert_eq!(
            updated,
            trakwyn_api::domain::education::Education { updated_at: updated.updated_at, ..created }
        );
    }

    #[tokio::test]
    async fn updating_a_missing_entry_is_an_internal_error() {
        let educations = PgEducationRepository::new(seeded().await);
        let err = educations.update("missing", UpdateEducationData::default()).await;
        assert!(matches!(err, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn deletes_an_entry() {
        let educations = PgEducationRepository::new(seeded().await);
        educations.create(education_data("edu-1", "user-1", date(2016, 9))).await.unwrap();

        educations.delete("edu-1", "user-1").await.unwrap();

        assert_eq!(educations.find_by_id("edu-1").await.unwrap(), None);
    }
}

fn experience_data(id: &str, user_id: &str, start_date: DateTime<Utc>) -> CreateWorkExperienceData {
    CreateWorkExperienceData {
        id: id.to_string(),
        user_id: user_id.to_string(),
        company: format!("company of {id}"),
        title: "Engineer".to_string(),
        location: Some("Remote".to_string()),
        start_date,
        end_date: Some(date(2023, 1)),
        description: Some("Built things".to_string()),
    }
}

mod work_experiences {
    use super::*;

    #[tokio::test]
    async fn creates_and_reads_back() {
        let experiences = PgWorkExperienceRepository::new(seeded().await);

        let created =
            experiences.create(experience_data("exp-1", "user-1", date(2020, 3))).await.unwrap();

        assert_eq!(created.company, "company of exp-1");
        assert_eq!(created.title, "Engineer");
        assert_eq!(created.start_date, date(2020, 3));
        assert_eq!(created.created_at, created.updated_at);
        assert_eq!(experiences.find_by_id("exp-1").await.unwrap(), Some(created));
    }

    #[tokio::test]
    async fn stores_nulls_for_the_optional_fields() {
        let experiences = PgWorkExperienceRepository::new(seeded().await);

        let created = experiences
            .create(CreateWorkExperienceData {
                location: None,
                end_date: None,
                description: None,
                ..experience_data("exp-1", "user-1", date(2020, 3))
            })
            .await
            .unwrap();

        assert_eq!((created.location, created.end_date, created.description), (None, None, None));
    }

    #[tokio::test]
    async fn finds_nothing_for_an_unknown_id() {
        let experiences = PgWorkExperienceRepository::new(seeded().await);
        assert_eq!(experiences.find_by_id("missing").await.unwrap(), None);
    }

    #[tokio::test]
    async fn lists_a_users_entries_latest_start_first_then_by_id_descending() {
        let db = seeded().await;
        seed_user(&db, "user-2").await;
        let experiences = PgWorkExperienceRepository::new(db);
        for (id, user_id, start_date) in [
            ("old", "user-1", date(2012, 1)),
            ("tie-a", "user-1", date(2018, 1)),
            ("tie-b", "user-1", date(2018, 1)),
            ("new", "user-1", date(2022, 1)),
            ("foreign", "user-2", date(2023, 1)),
        ] {
            experiences.create(experience_data(id, user_id, start_date)).await.unwrap();
        }

        let listed = experiences.find_all_by_user_id("user-1").await.unwrap();

        let ids: Vec<&str> = listed.iter().map(|experience| experience.id.as_str()).collect();
        assert_eq!(ids, vec!["new", "tie-b", "tie-a", "old"]);
    }

    #[tokio::test]
    async fn an_update_changes_only_what_it_names_and_moves_updated_at() {
        let experiences = PgWorkExperienceRepository::new(seeded().await);
        let created =
            experiences.create(experience_data("exp-1", "user-1", date(2020, 3))).await.unwrap();
        tick().await;

        let updated = experiences
            .update(
                "exp-1",
                UpdateWorkExperienceData {
                    company: Some("Globex".to_string()),
                    title: Some("Staff Engineer".to_string()),
                    location: Some(None),
                    start_date: Some(date(2021, 3)),
                    end_date: Some(None),
                    ..UpdateWorkExperienceData::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.company, "Globex");
        assert_eq!(updated.title, "Staff Engineer");
        assert_eq!(updated.location, None);
        assert_eq!(updated.start_date, date(2021, 3));
        assert_eq!(updated.end_date, None);
        // Left alone.
        assert_eq!(updated.description, created.description);
        assert_eq!(updated.created_at, created.created_at);
        assert!(updated.updated_at > created.updated_at);
        assert_eq!(experiences.find_by_id("exp-1").await.unwrap(), Some(updated));
    }

    #[tokio::test]
    async fn an_update_can_set_every_nullable_field() {
        let experiences = PgWorkExperienceRepository::new(seeded().await);
        experiences.create(experience_data("exp-1", "user-1", date(2020, 3))).await.unwrap();

        let updated = experiences
            .update(
                "exp-1",
                UpdateWorkExperienceData {
                    location: Some(Some("Berlin".to_string())),
                    description: Some(None),
                    end_date: Some(Some(date(2024, 1))),
                    ..UpdateWorkExperienceData::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.location.as_deref(), Some("Berlin"));
        assert_eq!(updated.description, None);
        assert_eq!(updated.end_date, Some(date(2024, 1)));
    }

    #[tokio::test]
    async fn updating_a_missing_entry_is_an_internal_error() {
        let experiences = PgWorkExperienceRepository::new(seeded().await);
        let err = experiences.update("missing", UpdateWorkExperienceData::default()).await;
        assert!(matches!(err, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn deletes_an_entry() {
        let experiences = PgWorkExperienceRepository::new(seeded().await);
        experiences.create(experience_data("exp-1", "user-1", date(2020, 3))).await.unwrap();

        experiences.delete("exp-1", "user-1").await.unwrap();

        assert_eq!(experiences.find_by_id("exp-1").await.unwrap(), None);
    }
}

fn skill_data(id: &str, user_id: &str) -> CreateSkillData {
    CreateSkillData {
        id: id.to_string(),
        user_id: user_id.to_string(),
        name: format!("name of {id}"),
        category: Some("Languages".to_string()),
        proficiency: Some("advanced".to_string()),
    }
}

mod skills {
    use super::*;

    #[tokio::test]
    async fn creates_and_reads_back() {
        let skills = PgSkillRepository::new(seeded().await);

        let created = skills.create(skill_data("skill-1", "user-1")).await.unwrap();

        assert_eq!(created.name, "name of skill-1");
        assert_eq!(created.category.as_deref(), Some("Languages"));
        assert_eq!(created.proficiency.as_deref(), Some("advanced"));
        assert_eq!(skills.find_by_id("skill-1").await.unwrap(), Some(created));
    }

    #[tokio::test]
    async fn stores_nulls_for_the_optional_fields() {
        let skills = PgSkillRepository::new(seeded().await);

        let created = skills
            .create(CreateSkillData {
                category: None,
                proficiency: None,
                ..skill_data("skill-1", "user-1")
            })
            .await
            .unwrap();

        assert_eq!((created.category, created.proficiency), (None, None));
    }

    #[tokio::test]
    async fn finds_nothing_for_an_unknown_id() {
        let skills = PgSkillRepository::new(seeded().await);
        assert_eq!(skills.find_by_id("missing").await.unwrap(), None);
    }

    #[tokio::test]
    async fn lists_a_users_skills_newest_first() {
        let db = seeded().await;
        seed_user(&db, "user-2").await;
        let skills = PgSkillRepository::new(db);
        for id in ["first", "second", "third"] {
            skills.create(skill_data(id, "user-1")).await.unwrap();
            tick().await;
        }
        skills.create(skill_data("foreign", "user-2")).await.unwrap();

        let listed = skills.find_all_by_user_id("user-1").await.unwrap();

        let ids: Vec<&str> = listed.iter().map(|skill| skill.id.as_str()).collect();
        assert_eq!(ids, vec!["third", "second", "first"]);
    }

    #[tokio::test]
    async fn skills_created_at_the_same_instant_list_by_id_descending() {
        let db = seeded().await;
        let shared = now();
        for id in ["s-a", "s-c", "s-b"] {
            sqlx::query(
                r#"INSERT INTO "Skill" ("id", "userId", "name", "createdAt")
                   VALUES ($1, 'user-1', 'Rust', $2)"#,
            )
            .bind(id)
            .bind(shared)
            .execute(db.pool())
            .await
            .unwrap();
        }

        let listed = PgSkillRepository::new(db).find_all_by_user_id("user-1").await.unwrap();

        let ids: Vec<&str> = listed.iter().map(|skill| skill.id.as_str()).collect();
        assert_eq!(ids, vec!["s-c", "s-b", "s-a"]);
    }

    #[tokio::test]
    async fn an_update_changes_only_what_it_names() {
        let skills = PgSkillRepository::new(seeded().await);
        let created = skills.create(skill_data("skill-1", "user-1")).await.unwrap();

        let renamed = skills
            .update(
                "skill-1",
                UpdateSkillData { name: Some("Rust".to_string()), ..UpdateSkillData::default() },
            )
            .await
            .unwrap();
        assert_eq!(renamed.name, "Rust");
        assert_eq!(renamed.category, created.category);
        assert_eq!(renamed.proficiency, created.proficiency);
        assert_eq!(renamed.created_at, created.created_at);

        let updated = skills
            .update(
                "skill-1",
                UpdateSkillData {
                    name: None,
                    category: Some(None),
                    proficiency: Some(Some("expert".to_string())),
                },
            )
            .await
            .unwrap();
        assert_eq!(updated.name, "Rust");
        assert_eq!(updated.category, None);
        assert_eq!(updated.proficiency.as_deref(), Some("expert"));
        assert_eq!(skills.find_by_id("skill-1").await.unwrap(), Some(updated));
    }

    #[tokio::test]
    async fn an_update_that_sets_nothing_is_an_internal_error() {
        let skills = PgSkillRepository::new(seeded().await);
        skills.create(skill_data("skill-1", "user-1")).await.unwrap();

        let err = skills.update("skill-1", UpdateSkillData::default()).await;

        assert!(matches!(err, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn updating_a_missing_skill_is_an_internal_error() {
        let skills = PgSkillRepository::new(seeded().await);
        let data = UpdateSkillData { name: Some("Rust".to_string()), ..UpdateSkillData::default() };
        assert!(matches!(skills.update("missing", data).await, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn deletes_a_skill() {
        let skills = PgSkillRepository::new(seeded().await);
        skills.create(skill_data("skill-1", "user-1")).await.unwrap();

        skills.delete("skill-1", "user-1").await.unwrap();

        assert_eq!(skills.find_by_id("skill-1").await.unwrap(), None);
    }
}

mod cookie_consents {
    use super::*;

    #[tokio::test]
    async fn records_an_accepted_decision() {
        let TestDb { db } = TestDb::create().await;
        let consents = PgCookieConsentRepository::new(db.clone());
        let before = now();

        let created = consents
            .create(CreateCookieConsentData {
                id: "consent-1".to_string(),
                analytics_accepted: true,
                ip_address: Some("203.0.113.7".to_string()),
                user_agent: Some("Mozilla/5.0".to_string()),
            })
            .await
            .unwrap();

        assert!(created.analytics_accepted);
        assert_eq!(created.ip_address.as_deref(), Some("203.0.113.7"));
        assert_eq!(created.user_agent.as_deref(), Some("Mozilla/5.0"));
        assert!(created.consented_at >= before);
        let stored: (bool, DateTime<Utc>) = sqlx::query_as(
            r#"SELECT "analyticsAccepted", "consentedAt" FROM "CookieConsent" WHERE "id" = 'consent-1'"#,
        )
        .fetch_one(db.pool())
        .await
        .unwrap();
        assert_eq!(stored, (true, created.consented_at));
    }

    #[tokio::test]
    async fn records_a_rejection_without_an_ip_or_user_agent() {
        let TestDb { db } = TestDb::create().await;

        let created = PgCookieConsentRepository::new(db)
            .create(CreateCookieConsentData {
                id: "consent-1".to_string(),
                analytics_accepted: false,
                ip_address: None,
                user_agent: None,
            })
            .await
            .unwrap();

        assert!(!created.analytics_accepted);
        assert_eq!((created.ip_address, created.user_agent), (None, None));
    }
}
