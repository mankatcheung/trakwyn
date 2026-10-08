use std::sync::Arc;

use super::support::*;
use crate::domain::user::User;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{sequential_ids, FakeStorageProvider, FakeUserRepository};
use crate::use_cases::user::*;

const OLD_KEY: &str = "users/user-1/avatar/old.png";
const NEW_KEY: &str = "users/user-1/avatar/new.png";

struct Fixture {
    users: Arc<FakeUserRepository>,
    storage: Arc<FakeStorageProvider>,
}

impl Fixture {
    fn new(users: Vec<User>, objects: &[&str]) -> Self {
        Self {
            users: Arc::new(FakeUserRepository::with(users)),
            storage: Arc::new(FakeStorageProvider::with_objects(objects)),
        }
    }

    fn request(&self) -> RequestAvatarUploadUrlUseCase {
        RequestAvatarUploadUrlUseCase {
            storage_provider: self.storage.clone(),
            generate_id: sequential_ids("id"),
        }
    }

    fn confirm(&self) -> ConfirmAvatarUseCase {
        ConfirmAvatarUseCase {
            user_repository: self.users.clone(),
            storage_provider: self.storage.clone(),
        }
    }

    fn remove(&self) -> RemoveAvatarUseCase {
        RemoveAvatarUseCase {
            user_repository: self.users.clone(),
            storage_provider: self.storage.clone(),
        }
    }
}

fn user_with_avatar() -> User {
    User { avatar_key: Some(OLD_KEY.to_string()), ..user() }
}

fn confirm_input(mime_type: &str, size_bytes: i32) -> ConfirmAvatarInput {
    ConfirmAvatarInput {
        user_id: USER.to_string(),
        storage_key: NEW_KEY.to_string(),
        mime_type: mime_type.to_string(),
        size_bytes,
    }
}

mod request_upload_url {
    use super::*;

    fn input(filename: &str, mime_type: &str) -> RequestAvatarUploadUrlInput {
        RequestAvatarUploadUrlInput {
            user_id: USER.to_string(),
            filename: filename.to_string(),
            mime_type: mime_type.to_string(),
        }
    }

    #[tokio::test]
    async fn refuses_a_type_that_is_not_an_allowed_image() {
        let fixture = Fixture::new(vec![], &[]);
        let err = fixture.request().execute(input("cv.pdf", "application/pdf")).await.unwrap_err();
        assert_error(&err, ErrorCode::Validation, "Unsupported image type: application/pdf");
    }

    #[tokio::test]
    async fn returns_an_upload_url_for_a_key_under_the_users_avatar_folder() {
        let fixture = Fixture::new(vec![], &[]);

        let output = fixture.request().execute(input("me.png", "image/png")).await.unwrap();

        assert_eq!(output.storage_key, "users/user-1/avatar/id-1-me.png");
        assert_eq!(output.upload_url, "fake-upload://users/user-1/avatar/id-1-me.png");
    }

    #[tokio::test]
    async fn sanitizes_the_filename() {
        let fixture = Fixture::new(vec![], &[]);

        let output =
            fixture.request().execute(input("my photo (final)!.jpg", "image/jpeg")).await.unwrap();

        assert_eq!(output.storage_key, "users/user-1/avatar/id-1-my-photo-final.jpg");
    }
}

mod confirm {
    use super::*;

    #[tokio::test]
    async fn refuses_a_type_that_is_not_an_allowed_image() {
        let fixture = Fixture::new(vec![user()], &[]);
        let err = fixture.confirm().execute(confirm_input("image/gif", 10)).await.unwrap_err();
        assert_error(&err, ErrorCode::Validation, "Unsupported image type: image/gif");
    }

    #[tokio::test]
    async fn refuses_a_size_that_is_not_positive() {
        let fixture = Fixture::new(vec![user()], &[]);
        let err = fixture.confirm().execute(confirm_input("image/png", 0)).await.unwrap_err();
        assert_error(&err, ErrorCode::Validation, "Image size must be greater than 0 bytes");
    }

    #[tokio::test]
    async fn refuses_a_size_over_the_limit() {
        let fixture = Fixture::new(vec![user()], &[]);
        let err = fixture
            .confirm()
            .execute(confirm_input("image/png", 5 * 1024 * 1024 + 1))
            .await
            .unwrap_err();
        assert_error(
            &err,
            ErrorCode::Validation,
            "Image exceeds the maximum allowed size of 5242880 bytes",
        );
        assert_eq!(stored(&fixture.users, USER).await.avatar_key, None);
    }

    #[tokio::test]
    async fn fails_when_the_user_does_not_exist() {
        let fixture = Fixture::new(vec![], &[]);
        let err = fixture.confirm().execute(confirm_input("image/png", 10)).await.unwrap_err();
        assert_error(&err, ErrorCode::NotFound, "User not found");
    }

    #[tokio::test]
    async fn sets_the_new_key_on_the_user() {
        let fixture = Fixture::new(vec![user()], &[NEW_KEY]);

        fixture.confirm().execute(confirm_input("image/png", 10)).await.unwrap();

        assert_eq!(stored(&fixture.users, USER).await.avatar_key.as_deref(), Some(NEW_KEY));
        // A first avatar has nothing to clean up.
        assert_eq!(fixture.storage.keys(), vec![NEW_KEY]);
    }

    #[tokio::test]
    async fn deletes_the_previous_file() {
        let fixture = Fixture::new(vec![user_with_avatar()], &[OLD_KEY, NEW_KEY]);

        fixture.confirm().execute(confirm_input("image/png", 10)).await.unwrap();

        assert_eq!(fixture.storage.keys(), vec![NEW_KEY]);
    }

    #[tokio::test]
    async fn confirming_the_same_key_again_does_not_delete_it() {
        let same = User { avatar_key: Some(NEW_KEY.to_string()), ..user() };
        let fixture = Fixture::new(vec![same], &[NEW_KEY]);

        fixture.confirm().execute(confirm_input("image/png", 10)).await.unwrap();

        assert!(fixture.storage.contains(NEW_KEY));
    }
}

mod remove {
    use super::*;

    #[tokio::test]
    async fn fails_when_the_user_does_not_exist() {
        let err = Fixture::new(vec![], &[]).remove().execute(USER).await.unwrap_err();
        assert_error(&err, ErrorCode::NotFound, "User not found");
    }

    #[tokio::test]
    async fn deletes_the_file_and_clears_the_key() {
        let fixture = Fixture::new(vec![user_with_avatar()], &[OLD_KEY, "unrelated"]);

        fixture.remove().execute(USER).await.unwrap();

        assert_eq!(stored(&fixture.users, USER).await.avatar_key, None);
        assert_eq!(fixture.storage.keys(), vec!["unrelated"]);
    }

    #[tokio::test]
    async fn is_a_no_op_for_a_user_with_no_avatar() {
        let fixture = Fixture::new(vec![user()], &["unrelated"]);
        let before = stored(&fixture.users, USER).await;

        fixture.remove().execute(USER).await.unwrap();

        // Not even `updatedAt` moves.
        assert_eq!(stored(&fixture.users, USER).await, before);
        assert_eq!(fixture.storage.keys(), vec!["unrelated"]);
    }
}
