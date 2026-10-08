use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::*;
use crate::domain::notification::{Notification, NotificationType};
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{sequential_ids, FakeNotificationRepository};

const OWNER: &str = "user-owner";
const STRANGER: &str = "user-stranger";

/// Ids sort like their creation order: `n01` is the oldest.
fn notification(number: usize, user_id: &str) -> Notification {
    Notification {
        id: format!("n{number:02}"),
        user_id: user_id.to_string(),
        notification_type: NotificationType::FollowUpReminder,
        title: "Follow up".to_string(),
        body: "Acme".to_string(),
        url: None,
        read_at: None,
        created_at: DateTime::<Utc>::from_timestamp(number as i64, 0).unwrap(),
    }
}

fn repository(count: usize) -> Arc<FakeNotificationRepository> {
    Arc::new(FakeNotificationRepository::with(
        (1..=count).map(|number| notification(number, OWNER)).collect(),
    ))
}

mod create {
    use super::*;

    fn input(url: Option<&str>) -> CreateNotificationInput {
        CreateNotificationInput {
            user_id: OWNER.to_string(),
            notification_type: NotificationType::InterviewReminder,
            title: "Interview tomorrow".to_string(),
            body: "Acme, 10:00".to_string(),
            url: url.map(str::to_string),
        }
    }

    #[tokio::test]
    async fn generates_an_id_and_creates_the_notification_unread() {
        let repository = repository(0);
        let use_case = CreateNotificationUseCase {
            notification_repository: repository.clone(),
            generate_id: sequential_ids("id"),
        };

        let created = use_case.execute(input(Some("/applications/app-1"))).await.unwrap();

        assert_eq!(created.id, "id-1");
        assert_eq!(created.user_id, OWNER);
        assert_eq!(created.notification_type, NotificationType::InterviewReminder);
        assert_eq!(created.title, "Interview tomorrow");
        assert_eq!(created.body, "Acme, 10:00");
        assert_eq!(created.url.as_deref(), Some("/applications/app-1"));
        assert_eq!(created.read_at, None);
        assert_eq!(repository.all(), vec![created]);
    }

    #[tokio::test]
    async fn passes_a_null_url_through_when_omitted() {
        let use_case = CreateNotificationUseCase {
            notification_repository: repository(0),
            generate_id: sequential_ids("id"),
        };

        let created = use_case.execute(input(None)).await.unwrap();

        assert_eq!(created.url, None);
    }
}

mod page {
    use super::*;

    async fn page(
        repository: &Arc<FakeNotificationRepository>,
        cursor: Option<&str>,
        limit: Option<i64>,
    ) -> GetNotificationsPageOutput {
        GetNotificationsPageUseCase { notification_repository: repository.clone() }
            .execute(GetNotificationsPageInput {
                user_id: OWNER.to_string(),
                cursor: cursor.map(str::to_string),
                limit,
            })
            .await
            .unwrap()
    }

    fn ids(output: &GetNotificationsPageOutput) -> Vec<&str> {
        output.items.iter().map(|notification| notification.id.as_str()).collect()
    }

    #[tokio::test]
    async fn defaults_the_limit_to_twenty_newest_first() {
        let output = page(&repository(25), None, None).await;

        assert_eq!(output.items.len(), 20);
        assert_eq!(output.items[0].id, "n25");
        assert!(output.has_next_page);
        assert_eq!(output.next_cursor.as_deref(), Some("n06"));
    }

    #[tokio::test]
    async fn passes_a_cursor_and_limit_within_bounds_through() {
        let output = page(&repository(5), Some("n04"), Some(2)).await;

        assert_eq!(ids(&output), vec!["n03", "n02"]);
        assert!(output.has_next_page);
        assert_eq!(output.next_cursor.as_deref(), Some("n02"));
    }

    #[tokio::test]
    async fn clamps_a_limit_above_the_max_down_to_the_max() {
        let output = page(&repository(120), None, Some(1000)).await;

        assert_eq!(output.items.len(), 100);
        assert!(output.has_next_page);
    }

    #[tokio::test]
    async fn clamps_a_limit_below_one_up_to_one() {
        let repository = repository(3);
        for limit in [0, -5] {
            let output = page(&repository, None, Some(limit)).await;
            assert_eq!(ids(&output), vec!["n03"]);
            assert_eq!(output.next_cursor.as_deref(), Some("n03"));
        }
    }

    #[tokio::test]
    async fn has_no_next_cursor_on_the_last_page() {
        let output = page(&repository(2), None, Some(2)).await;

        assert_eq!(ids(&output), vec!["n02", "n01"]);
        assert!(!output.has_next_page);
        assert_eq!(output.next_cursor, None);
    }

    #[tokio::test]
    async fn shows_only_the_users_notifications() {
        let repository = Arc::new(FakeNotificationRepository::with(vec![
            notification(1, OWNER),
            notification(2, STRANGER),
        ]));

        let output = page(&repository, None, None).await;

        assert_eq!(ids(&output), vec!["n01"]);
    }
}

mod unread_count {
    use super::*;

    #[tokio::test]
    async fn counts_the_users_unread_notifications() {
        let read =
            Notification { read_at: Some(DateTime::<Utc>::UNIX_EPOCH), ..notification(3, OWNER) };
        let repository = Arc::new(FakeNotificationRepository::with(vec![
            notification(1, OWNER),
            notification(2, OWNER),
            read,
            notification(4, STRANGER),
        ]));

        let count = GetUnreadNotificationCountUseCase { notification_repository: repository }
            .execute(OWNER)
            .await
            .unwrap();

        assert_eq!(count, 2);
    }
}

mod mark_read {
    use super::*;

    fn input(ids: Vec<String>, is_read: bool) -> MarkNotificationsReadInput {
        MarkNotificationsReadInput { user_id: OWNER.to_string(), ids, is_read }
    }

    fn use_case(repository: &Arc<FakeNotificationRepository>) -> MarkNotificationsReadUseCase {
        MarkNotificationsReadUseCase { notification_repository: repository.clone() }
    }

    fn read_ids(repository: &FakeNotificationRepository) -> Vec<String> {
        repository
            .all()
            .into_iter()
            .filter(|notification| notification.read_at.is_some())
            .map(|notification| notification.id)
            .collect()
    }

    #[tokio::test]
    async fn marks_the_given_notifications_read_then_unread() {
        let repository = repository(3);
        let ids = vec!["n01".to_string(), "n03".to_string()];

        use_case(&repository).execute(input(ids.clone(), true)).await.unwrap();
        assert_eq!(read_ids(&repository), ids);

        use_case(&repository).execute(input(vec!["n01".to_string()], false)).await.unwrap();
        assert_eq!(read_ids(&repository), vec!["n03".to_string()]);
    }

    #[tokio::test]
    async fn ignores_ids_that_belong_to_someone_else() {
        let repository = Arc::new(FakeNotificationRepository::with(vec![
            notification(1, OWNER),
            notification(2, STRANGER),
        ]));

        use_case(&repository)
            .execute(input(vec!["n01".to_string(), "n02".to_string()], true))
            .await
            .unwrap();

        assert_eq!(read_ids(&repository), vec!["n01".to_string()]);
    }

    #[tokio::test]
    async fn refuses_an_empty_batch() {
        let err = use_case(&repository(1)).execute(input(vec![], true)).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "At least one notification id is required");
    }

    #[tokio::test]
    async fn refuses_more_than_the_max_ids_and_accepts_exactly_the_max() {
        let repository = repository(1);
        let ids = |count: usize| (0..count).map(|number| format!("id-{number}")).collect();

        let err = use_case(&repository).execute(input(ids(201), true)).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "Cannot act on more than 200 notifications at once");

        use_case(&repository).execute(input(ids(200), true)).await.unwrap();
    }
}
