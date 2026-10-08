use std::sync::Arc;

use super::support::*;
use crate::domain::user::{DigestFrequency, User};
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::FakeUserRepository;
use crate::use_cases::user::*;

fn text(value: &str) -> Option<Option<String>> {
    Some(Some(value.to_string()))
}

fn input() -> UpdateProfileInput {
    UpdateProfileInput { user_id: USER.to_string(), ..UpdateProfileInput::default() }
}

fn update_profile(users: &Arc<FakeUserRepository>) -> UpdateProfileUseCase {
    UpdateProfileUseCase { user_repository: users.clone() }
}

mod get_user {
    use super::*;

    #[tokio::test]
    async fn returns_the_user_when_found() {
        let users = users(vec![user()]);
        let found = GetUserUseCase { user_repository: users }.execute(USER).await.unwrap();
        assert_eq!(found, Some(user()));
    }

    #[tokio::test]
    async fn returns_none_when_the_user_does_not_exist() {
        let found = GetUserUseCase { user_repository: users(vec![]) }.execute(USER).await.unwrap();
        assert_eq!(found, None);
    }
}

mod update {
    use super::*;

    #[tokio::test]
    async fn fails_when_the_user_does_not_exist() {
        let err = update_profile(&users(vec![])).execute(input()).await.unwrap_err();
        assert_error(&err, ErrorCode::NotFound, "User not found");
    }

    #[tokio::test]
    async fn updates_every_text_field_together_trimming_each() {
        let users = users(vec![user()]);

        update_profile(&users)
            .execute(UpdateProfileInput {
                name: text("  Ada Lovelace "),
                timezone: text("Europe/London"),
                target_role: text("Staff Engineer"),
                custom_ai_prompt: text("Be concise."),
                ..input()
            })
            .await
            .unwrap();

        let stored = stored(&users, USER).await;
        assert_eq!(stored.name.as_deref(), Some("Ada Lovelace"));
        assert_eq!(stored.timezone.as_deref(), Some("Europe/London"));
        assert_eq!(stored.target_role.as_deref(), Some("Staff Engineer"));
        assert_eq!(stored.custom_ai_prompt.as_deref(), Some("Be concise."));
    }

    #[tokio::test]
    async fn leaves_unmentioned_fields_untouched() {
        let before = User {
            name: Some("Ada".to_string()),
            timezone: Some("UTC".to_string()),
            use_cross_application_context: true,
            ..user()
        };
        let users = users(vec![before.clone()]);

        update_profile(&users)
            .execute(UpdateProfileInput { target_role: text("Engineer"), ..input() })
            .await
            .unwrap();

        let stored = stored(&users, USER).await;
        assert_eq!(stored.name, before.name);
        assert_eq!(stored.timezone, before.timezone);
        assert!(stored.use_cross_application_context);
        assert_eq!(stored.target_role.as_deref(), Some("Engineer"));
    }

    #[tokio::test]
    async fn passes_the_boolean_switches_straight_through_on_or_off() {
        let users = users(vec![user()]);

        update_profile(&users)
            .execute(UpdateProfileInput {
                use_cross_application_context: Some(true),
                llm_fallback_when_limited: Some(true),
                ..input()
            })
            .await
            .unwrap();
        let on = stored(&users, USER).await;
        assert!(on.use_cross_application_context && on.llm_fallback_when_limited);

        update_profile(&users)
            .execute(UpdateProfileInput {
                use_cross_application_context: Some(false),
                llm_fallback_when_limited: Some(false),
                ..input()
            })
            .await
            .unwrap();
        let off = stored(&users, USER).await;
        assert!(!off.use_cross_application_context && !off.llm_fallback_when_limited);
    }

    #[tokio::test]
    async fn an_empty_or_blank_string_clears_the_field() {
        let users = users(vec![User {
            name: Some("Ada".to_string()),
            custom_ai_prompt: Some("Be concise.".to_string()),
            ..user()
        }]);

        update_profile(&users)
            .execute(UpdateProfileInput {
                name: text(""),
                custom_ai_prompt: text(" \t\n"),
                ..input()
            })
            .await
            .unwrap();

        let stored = stored(&users, USER).await;
        assert_eq!(stored.name, None);
        assert_eq!(stored.custom_ai_prompt, None);
    }

    #[tokio::test]
    async fn an_explicit_null_clears_the_field() {
        let users = users(vec![User { timezone: Some("UTC".to_string()), ..user() }]);

        update_profile(&users)
            .execute(UpdateProfileInput { timezone: Some(None), ..input() })
            .await
            .unwrap();

        assert_eq!(stored(&users, USER).await.timezone, None);
    }

    #[tokio::test]
    async fn refuses_a_timezone_that_is_not_an_iana_zone() {
        let users = users(vec![user()]);

        let err = update_profile(&users)
            .execute(UpdateProfileInput { timezone: text("Mars/Phobos"), ..input() })
            .await
            .unwrap_err();

        assert_error(&err, ErrorCode::Validation, "Invalid timezone");
        assert_eq!(stored(&users, USER).await.timezone, None);
    }

    #[tokio::test]
    async fn accepts_utc() {
        let users = users(vec![user()]);

        update_profile(&users)
            .execute(UpdateProfileInput { timezone: text("UTC"), ..input() })
            .await
            .unwrap();

        assert_eq!(stored(&users, USER).await.timezone.as_deref(), Some("UTC"));
    }

    #[tokio::test]
    async fn refuses_a_name_over_100_characters_and_allows_exactly_100() {
        let users = users(vec![user()]);

        let err = update_profile(&users)
            .execute(UpdateProfileInput { name: text(&"a".repeat(101)), ..input() })
            .await
            .unwrap_err();
        assert_error(&err, ErrorCode::Validation, "Name is too long");

        update_profile(&users)
            .execute(UpdateProfileInput { name: text(&"a".repeat(100)), ..input() })
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn refuses_a_target_role_over_100_characters() {
        let err = update_profile(&users(vec![user()]))
            .execute(UpdateProfileInput { target_role: text(&"r".repeat(101)), ..input() })
            .await
            .unwrap_err();
        assert_error(&err, ErrorCode::Validation, "Target role is too long");
    }

    #[tokio::test]
    async fn refuses_an_ai_prompt_over_500_characters() {
        let err = update_profile(&users(vec![user()]))
            .execute(UpdateProfileInput { custom_ai_prompt: text(&"p".repeat(501)), ..input() })
            .await
            .unwrap_err();
        assert_error(&err, ErrorCode::Validation, "AI prompt is too long");
    }

    #[tokio::test]
    async fn measures_length_in_utf16_units_after_trimming() {
        let users = users(vec![user()]);
        // 51 emoji are 102 UTF-16 units: too long, though only 51 characters.
        let err = update_profile(&users)
            .execute(UpdateProfileInput { name: text(&"😀".repeat(51)), ..input() })
            .await
            .unwrap_err();
        assert_error(&err, ErrorCode::Validation, "Name is too long");

        // Padding does not count.
        let padded = format!("  {}  ", "a".repeat(100));
        update_profile(&users)
            .execute(UpdateProfileInput { name: text(&padded), ..input() })
            .await
            .unwrap();
    }
}

mod onboarding {
    use super::*;
    use crate::use_cases::clock::now;

    #[tokio::test]
    async fn fails_when_the_user_does_not_exist() {
        let err = DismissOnboardingChecklistUseCase { user_repository: users(vec![]) }
            .execute(USER)
            .await
            .unwrap_err();
        assert_error(&err, ErrorCode::NotFound, "User not found");
    }

    #[tokio::test]
    async fn stamps_the_dismissal_with_the_current_time() {
        let users = users(vec![user()]);
        let before = now();

        DismissOnboardingChecklistUseCase { user_repository: users.clone() }
            .execute(USER)
            .await
            .unwrap();

        let dismissed_at = stored(&users, USER).await.onboarding_checklist_dismissed_at.unwrap();
        assert!(dismissed_at >= before && dismissed_at <= now());
    }
}

mod notification_preferences {
    use super::*;

    fn get(users: &Arc<FakeUserRepository>) -> GetNotificationPreferencesUseCase {
        GetNotificationPreferencesUseCase { user_repository: users.clone() }
    }

    fn update(users: &Arc<FakeUserRepository>) -> UpdateNotificationPreferencesUseCase {
        UpdateNotificationPreferencesUseCase { user_repository: users.clone() }
    }

    fn input() -> UpdateNotificationPreferencesInput {
        UpdateNotificationPreferencesInput {
            user_id: USER.to_string(),
            ..UpdateNotificationPreferencesInput::default()
        }
    }

    #[tokio::test]
    async fn reading_fails_when_the_user_does_not_exist() {
        let err = get(&users(vec![])).execute(USER).await.unwrap_err();
        assert_error(&err, ErrorCode::NotFound, "User not found");
    }

    #[tokio::test]
    async fn reads_the_preferences_off_the_user() {
        let users = users(vec![User {
            weekly_digest_enabled: false,
            digest_frequency: DigestFrequency::Off,
            follow_up_reminders_enabled: false,
            push_notifications_enabled: true,
            weekly_application_goal: 12,
            ..user()
        }]);

        assert_eq!(
            get(&users).execute(USER).await.unwrap(),
            NotificationPreferences {
                weekly_digest_enabled: false,
                digest_frequency: DigestFrequency::Off,
                follow_up_reminders_enabled: false,
                push_notifications_enabled: true,
                weekly_application_goal: 12,
            }
        );
    }

    #[tokio::test]
    async fn updating_fails_when_the_user_does_not_exist() {
        let err = update(&users(vec![])).execute(input()).await.unwrap_err();
        assert_error(&err, ErrorCode::NotFound, "User not found");
    }

    #[tokio::test]
    async fn updates_the_given_preferences() {
        let users = users(vec![user()]);

        update(&users)
            .execute(UpdateNotificationPreferencesInput {
                weekly_digest_enabled: Some(false),
                follow_up_reminders_enabled: Some(false),
                push_notifications_enabled: Some(true),
                ..input()
            })
            .await
            .unwrap();

        let stored = stored(&users, USER).await;
        assert!(!stored.weekly_digest_enabled);
        assert!(!stored.follow_up_reminders_enabled);
        assert!(stored.push_notifications_enabled);
        // The frequency is only written when one is sent.
        assert_eq!(stored.digest_frequency, DigestFrequency::Weekly);
    }

    #[tokio::test]
    async fn leaves_unmentioned_preferences_untouched() {
        let users = users(vec![user()]);

        update(&users)
            .execute(UpdateNotificationPreferencesInput {
                push_notifications_enabled: Some(true),
                ..input()
            })
            .await
            .unwrap();

        let stored = stored(&users, USER).await;
        assert!(stored.weekly_digest_enabled);
        assert!(stored.follow_up_reminders_enabled);
        assert_eq!(stored.weekly_application_goal, 5);
    }

    #[tokio::test]
    async fn a_frequency_of_off_turns_the_digest_off_whatever_the_switch_says() {
        let users = users(vec![user()]);

        update(&users)
            .execute(UpdateNotificationPreferencesInput {
                weekly_digest_enabled: Some(true),
                digest_frequency: Some(DigestFrequency::Off),
                ..input()
            })
            .await
            .unwrap();

        let stored = stored(&users, USER).await;
        assert!(!stored.weekly_digest_enabled);
        assert_eq!(stored.digest_frequency, DigestFrequency::Off);
    }

    #[tokio::test]
    async fn any_other_frequency_turns_the_digest_on() {
        let users = users(vec![User { weekly_digest_enabled: false, ..user() }]);

        update(&users)
            .execute(UpdateNotificationPreferencesInput {
                weekly_digest_enabled: Some(false),
                digest_frequency: Some(DigestFrequency::Daily),
                ..input()
            })
            .await
            .unwrap();

        let stored = stored(&users, USER).await;
        assert!(stored.weekly_digest_enabled);
        assert_eq!(stored.digest_frequency, DigestFrequency::Daily);
    }

    #[tokio::test]
    async fn stores_a_goal_within_bounds_and_refuses_one_outside() {
        let users = users(vec![user()]);

        for goal in [1, 100] {
            update(&users)
                .execute(UpdateNotificationPreferencesInput {
                    weekly_application_goal: Some(goal),
                    ..input()
                })
                .await
                .unwrap();
            assert_eq!(stored(&users, USER).await.weekly_application_goal, goal);
        }

        for goal in [0, 101, -3] {
            let err = update(&users)
                .execute(UpdateNotificationPreferencesInput {
                    weekly_application_goal: Some(goal),
                    ..input()
                })
                .await
                .unwrap_err();
            assert_error(
                &err,
                ErrorCode::Validation,
                "Weekly application goal must be between 1 and 100",
            );
        }
        assert_eq!(stored(&users, USER).await.weekly_application_goal, 100);
    }
}
