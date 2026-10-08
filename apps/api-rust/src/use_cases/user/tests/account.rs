use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::support::*;
use crate::domain::document::Document;
use crate::domain::user::User;
use crate::use_cases::auth::SessionAuthTime;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{
    user_with_email, FakeDocumentRepository, FakeStorageProvider, FakeUserRepository,
};
use crate::use_cases::user::*;

struct Fixture {
    users: Arc<FakeUserRepository>,
    documents: Arc<FakeDocumentRepository>,
    storage: Arc<FakeStorageProvider>,
}

impl Fixture {
    /// The user's documents `doc-1` and `doc-2`, someone else's `doc-3`, and
    /// every file in storage.
    fn new(users: Vec<User>) -> Self {
        let documents = FakeDocumentRepository::with(vec![
            document("doc-1", "app-1", "users/user-1/a.pdf"),
            document("doc-2", "app-2", "users/user-1/b.pdf"),
            document("doc-3", "app-9", "users/user-2/c.pdf"),
        ])
        .owned_by("app-1", USER)
        .owned_by("app-2", USER)
        .owned_by("app-9", "user-2");
        Self {
            users: Arc::new(FakeUserRepository::with(users)),
            documents: Arc::new(documents),
            storage: Arc::new(FakeStorageProvider::with_objects(&[
                "users/user-1/a.pdf",
                "users/user-1/b.pdf",
                "users/user-2/c.pdf",
            ])),
        }
    }

    fn use_case(&self) -> DeleteAccountUseCase {
        DeleteAccountUseCase {
            user_repository: self.users.clone(),
            document_repository: self.documents.clone(),
            storage_provider: self.storage.clone(),
        }
    }

    fn user_ids(&self) -> Vec<String> {
        self.users.all().into_iter().map(|user| user.id).collect()
    }
}

fn document(id: &str, application_id: &str, storage_key: &str) -> Document {
    Document {
        id: id.to_string(),
        application_id: application_id.to_string(),
        name: format!("{id}.pdf"),
        mime_type: "application/pdf".to_string(),
        size_bytes: 1024,
        storage_key: storage_key.to_string(),
        document_type: "other".to_string(),
        version: None,
        source_draft_id: None,
        created_at: DateTime::<Utc>::UNIX_EPOCH,
    }
}

fn other_user() -> User {
    user_with_email("user-2", "other@example.com")
}

fn input(password: &str, auth_time: SessionAuthTime) -> DeleteAccountInput {
    DeleteAccountInput { user_id: USER.to_string(), password: password.to_string(), auth_time }
}

#[tokio::test]
async fn deletes_the_user_when_the_password_is_right() {
    let fixture = Fixture::new(vec![user(), other_user()]);

    fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap();

    assert_eq!(fixture.user_ids(), vec!["user-2"]);
}

#[tokio::test]
async fn deletes_the_users_files_from_storage_and_nobody_elses() {
    let fixture = Fixture::new(vec![user(), other_user()]);

    fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap();

    assert_eq!(fixture.storage.keys(), vec!["users/user-2/c.pdf"]);
}

#[tokio::test]
async fn succeeds_for_a_user_with_no_documents() {
    let fixture = Fixture::new(vec![user()]);
    let fixture = Fixture { documents: Arc::default(), ..fixture };

    fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap();

    assert!(fixture.user_ids().is_empty());
    assert_eq!(fixture.storage.keys().len(), 3);
}

#[tokio::test]
async fn a_file_already_gone_from_storage_does_not_stop_the_deletion() {
    let fixture = Fixture::new(vec![user()]);
    let fixture = Fixture { storage: Arc::default(), ..fixture };

    fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap();

    assert!(fixture.user_ids().is_empty());
}

#[tokio::test]
async fn fails_when_the_user_does_not_exist() {
    let fixture = Fixture::new(vec![]);
    let err = fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap_err();
    assert_error(&err, ErrorCode::NotFound, "User not found");
}

#[tokio::test]
async fn refuses_a_wrong_password_and_deletes_nothing() {
    let fixture = Fixture::new(vec![user()]);

    let err = fixture.use_case().execute(input(WRONG_PASSWORD, fresh())).await.unwrap_err();

    assert_error(&err, ErrorCode::Unauthorized, "Invalid password");
    assert_eq!(fixture.user_ids(), vec![USER]);
    assert_eq!(fixture.storage.keys().len(), 3);
}

#[tokio::test]
async fn refuses_an_account_with_no_password() {
    let fixture = Fixture::new(vec![oauth_only_user()]);
    let err = fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap_err();
    assert_error(&err, ErrorCode::Unauthorized, NO_PASSWORD_MESSAGE);
    assert_eq!(fixture.user_ids(), vec![USER]);
}

mod step_up {
    use super::*;

    #[tokio::test]
    async fn a_2fa_account_on_a_stale_session_must_step_up() {
        let fixture = Fixture::new(vec![user_with_2fa()]);

        let err = fixture.use_case().execute(input(PASSWORD, stale())).await.unwrap_err();

        assert_error(&err, ErrorCode::StepUpRequired, STEP_UP_MESSAGE);
        assert_eq!(fixture.user_ids(), vec![USER]);
        assert_eq!(fixture.storage.keys().len(), 3);
    }

    #[tokio::test]
    async fn a_2fa_account_on_a_fresh_session_is_deleted() {
        let fixture = Fixture::new(vec![user_with_2fa()]);
        fixture.use_case().execute(input(PASSWORD, fresh())).await.unwrap();
        assert!(fixture.user_ids().is_empty());
    }

    #[tokio::test]
    async fn an_account_without_2fa_needs_no_freshness() {
        for auth_time in [stale(), SessionAuthTime::Missing] {
            let fixture = Fixture::new(vec![user()]);
            fixture.use_case().execute(input(PASSWORD, auth_time)).await.unwrap();
            assert!(fixture.user_ids().is_empty());
        }
    }
}
