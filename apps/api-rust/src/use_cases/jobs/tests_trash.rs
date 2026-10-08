use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, TimeDelta, Utc};

use super::*;
use crate::domain::application::Application;
use crate::domain::document::Document;
use crate::use_cases::clock::now;
use crate::use_cases::constants::trash;
use crate::use_cases::errors::{DomainError, DomainResult, ErrorCode};
use crate::use_cases::ports::storage_provider::StorageProvider;
use crate::use_cases::ports::ApplicationRepository;
use crate::use_cases::test_support::{
    application_owned_by, FakeApplicationRepository, FakeDocumentRepository, FakeLogger,
    FakeStorageProvider, LogLevel,
};

const OWNER: &str = "user-owner";
const STRANGER: &str = "user-stranger";

fn trashed_at(id: &str, user_id: &str, deleted_at: DateTime<Utc>) -> Application {
    Application { deleted_at: Some(deleted_at), ..application_owned_by(id, user_id) }
}

fn trashed(id: &str, user_id: &str) -> Application {
    trashed_at(id, user_id, now())
}

fn document(id: &str, application_id: &str) -> Document {
    Document {
        id: id.to_string(),
        application_id: application_id.to_string(),
        name: format!("{id}.pdf"),
        mime_type: "application/pdf".to_string(),
        size_bytes: 1,
        storage_key: format!("users/{OWNER}/applications/{application_id}/{id}"),
        document_type: "resume".to_string(),
        version: None,
        source_draft_id: None,
        created_at: DateTime::<Utc>::UNIX_EPOCH,
    }
}

/// A store whose bulk delete is down.
struct BrokenStorage;

#[async_trait]
impl StorageProvider for BrokenStorage {
    async fn get_presigned_upload_url(
        &self,
        _key: &str,
        _mime_type: &str,
        _ttl_seconds: Option<u64>,
    ) -> DomainResult<String> {
        Err(DomainError::internal("storage is down"))
    }

    async fn get_signed_url(&self, _key: &str, _ttl_seconds: Option<u64>) -> DomainResult<String> {
        Err(DomainError::internal("storage is down"))
    }

    async fn put_object(&self, _key: &str, _data: &[u8], _mime_type: &str) -> DomainResult<()> {
        Err(DomainError::internal("storage is down"))
    }

    async fn delete(&self, _key: &str) -> DomainResult<()> {
        Err(DomainError::internal("storage is down"))
    }

    async fn delete_many(&self, _keys: &[String]) -> DomainResult<()> {
        Err(DomainError::internal("storage is down"))
    }
}

struct Fixture {
    applications: Arc<FakeApplicationRepository>,
    documents: Arc<FakeDocumentRepository>,
    storage: Arc<FakeStorageProvider>,
    logger: Arc<FakeLogger>,
}

impl Fixture {
    fn new(applications: Vec<Application>, documents: Vec<Document>) -> Self {
        let keys: Vec<&str> = documents.iter().map(|doc| doc.storage_key.as_str()).collect();
        Self {
            storage: Arc::new(FakeStorageProvider::with_objects(&keys)),
            applications: Arc::new(FakeApplicationRepository::with(applications)),
            documents: Arc::new(FakeDocumentRepository::with(documents)),
            logger: Arc::default(),
        }
    }

    fn permanently_delete(&self) -> PermanentlyDeleteApplicationUseCase {
        self.permanently_delete_with(self.storage.clone())
    }

    fn permanently_delete_with(
        &self,
        storage: Arc<dyn StorageProvider>,
    ) -> PermanentlyDeleteApplicationUseCase {
        PermanentlyDeleteApplicationUseCase {
            application_repository: self.applications.clone(),
            document_repository: self.documents.clone(),
            storage_provider: storage,
        }
    }

    fn empty_trash(&self, delete: PermanentlyDeleteApplicationUseCase) -> EmptyTrashUseCase {
        EmptyTrashUseCase {
            application_repository: self.applications.clone(),
            permanently_delete_application_use_case: delete,
            logger: self.logger.clone(),
        }
    }

    fn purge(
        &self,
        delete: PermanentlyDeleteApplicationUseCase,
    ) -> PurgeExpiredApplicationsUseCase {
        PurgeExpiredApplicationsUseCase {
            application_repository: self.applications.clone(),
            permanently_delete_application_use_case: delete,
            logger: self.logger.clone(),
        }
    }

    async fn exists(&self, id: &str) -> bool {
        self.applications.find_by_id_including_trashed(id).await.unwrap().is_some()
    }
}

fn delete_input(user_id: &str, application_id: &str) -> PermanentlyDeleteApplicationInput {
    PermanentlyDeleteApplicationInput {
        user_id: user_id.to_string(),
        application_id: application_id.to_string(),
    }
}

mod permanently_delete {
    use super::*;

    #[tokio::test]
    async fn removes_the_blobs_and_then_the_application() {
        let fixture = Fixture::new(
            vec![trashed("app", OWNER)],
            vec![document("d1", "app"), document("d2", "app"), document("other", "elsewhere")],
        );

        fixture.permanently_delete().execute(delete_input(OWNER, "app")).await.unwrap();

        assert!(!fixture.exists("app").await);
        assert_eq!(
            fixture.storage.keys(),
            vec![format!("users/{OWNER}/applications/elsewhere/other")]
        );
    }

    #[tokio::test]
    async fn destroys_a_live_application_too() {
        let fixture = Fixture::new(vec![application_owned_by("app", OWNER)], vec![]);

        fixture.permanently_delete().execute(delete_input(OWNER, "app")).await.unwrap();

        assert!(!fixture.exists("app").await);
    }

    #[tokio::test]
    async fn fails_when_the_application_does_not_exist() {
        let fixture = Fixture::new(vec![], vec![]);

        let err =
            fixture.permanently_delete().execute(delete_input(OWNER, "missing")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Application not found");
    }

    #[tokio::test]
    async fn refuses_someone_elses_application_and_touches_nothing() {
        let fixture = Fixture::new(vec![trashed("app", OWNER)], vec![document("d1", "app")]);

        let err =
            fixture.permanently_delete().execute(delete_input(STRANGER, "app")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert!(fixture.exists("app").await);
        assert_eq!(fixture.storage.keys().len(), 1);
    }

    #[tokio::test]
    async fn keeps_the_row_when_the_blobs_cannot_be_removed() {
        let fixture = Fixture::new(vec![trashed("app", OWNER)], vec![document("d1", "app")]);

        let result = fixture
            .permanently_delete_with(Arc::new(BrokenStorage))
            .execute(delete_input(OWNER, "app"))
            .await;

        // The row holds the only record of the storage keys: losing it first
        // would orphan the files.
        assert!(result.is_err());
        assert!(fixture.exists("app").await);
    }
}

mod empty_trash {
    use super::*;

    fn input() -> EmptyTrashInput {
        EmptyTrashInput { user_id: OWNER.to_string() }
    }

    #[tokio::test]
    async fn destroys_everything_in_the_users_trash_and_nothing_else() {
        let fixture = Fixture::new(
            vec![
                trashed("a", OWNER),
                trashed("b", OWNER),
                application_owned_by("live", OWNER),
                trashed("theirs", STRANGER),
            ],
            vec![document("d1", "a")],
        );

        let result =
            fixture.empty_trash(fixture.permanently_delete()).execute(input()).await.unwrap();

        assert_eq!(result, EmptyTrashResult { deleted: 2, failed: 0 });
        assert!(!fixture.exists("a").await);
        assert!(!fixture.exists("b").await);
        assert!(fixture.exists("live").await);
        assert!(fixture.exists("theirs").await);
        assert!(fixture.storage.keys().is_empty());
    }

    #[tokio::test]
    async fn an_empty_trash_is_not_an_error() {
        let fixture = Fixture::new(vec![application_owned_by("live", OWNER)], vec![]);

        let result =
            fixture.empty_trash(fixture.permanently_delete()).execute(input()).await.unwrap();

        assert_eq!(result, EmptyTrashResult { deleted: 0, failed: 0 });
    }

    #[tokio::test]
    async fn counts_and_logs_a_failure_instead_of_returning_it() {
        let fixture = Fixture::new(vec![trashed("a", OWNER), trashed("b", OWNER)], vec![]);
        let broken = fixture.permanently_delete_with(Arc::new(BrokenStorage));

        let result = fixture.empty_trash(broken).execute(input()).await.unwrap();

        assert_eq!(result, EmptyTrashResult { deleted: 0, failed: 2 });
        let lines = fixture.logger.lines();
        assert_eq!(lines.len(), 2);
        assert!(lines.iter().all(|line| line.level == LogLevel::Error));
        let mut messages: Vec<&str> = lines.iter().map(|line| line.message.as_str()).collect();
        messages.sort_unstable();
        assert_eq!(
            messages,
            vec![
                "Failed to empty application a from Trash",
                "Failed to empty application b from Trash"
            ]
        );
    }
}

mod purge_expired {
    use super::*;

    fn long_ago() -> DateTime<Utc> {
        now() - TimeDelta::milliseconds(trash::RETENTION_MS) - TimeDelta::minutes(1)
    }

    fn recently() -> DateTime<Utc> {
        now() - TimeDelta::milliseconds(trash::RETENTION_MS) + TimeDelta::minutes(1)
    }

    #[tokio::test]
    async fn purges_what_has_served_its_retention_across_users() {
        let fixture = Fixture::new(
            vec![
                trashed_at("expired", OWNER, long_ago()),
                trashed_at("theirs-expired", STRANGER, long_ago()),
                trashed_at("fresh", OWNER, recently()),
                application_owned_by("live", OWNER),
            ],
            vec![document("d1", "expired")],
        );

        let result = fixture.purge(fixture.permanently_delete()).execute().await.unwrap();

        assert_eq!(result, PurgeExpiredApplicationsResult { purged: 2, failed: 0 });
        assert!(!fixture.exists("expired").await);
        assert!(!fixture.exists("theirs-expired").await);
        assert!(fixture.exists("fresh").await);
        assert!(fixture.exists("live").await);
        assert!(fixture.storage.keys().is_empty());
    }

    #[tokio::test]
    async fn counts_and_logs_a_failure_and_leaves_the_row_for_the_next_run() {
        let fixture = Fixture::new(vec![trashed_at("expired", OWNER, long_ago())], vec![]);
        let broken = fixture.permanently_delete_with(Arc::new(BrokenStorage));

        let result = fixture.purge(broken).execute().await.unwrap();

        assert_eq!(result, PurgeExpiredApplicationsResult { purged: 0, failed: 1 });
        assert!(fixture.exists("expired").await);
        assert_eq!(fixture.logger.lines()[0].message, "Failed to purge application expired");
    }
}
