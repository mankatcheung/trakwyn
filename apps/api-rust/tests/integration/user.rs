//! Profile, avatar and notification preferences through the real GraphQL
//! endpoint and a real database.

use serde_json::{json, Value};

use crate::account_support::{seed_account, status_code, user_column};
use crate::common::{Auth, TestApp};

const ME: &str = "{ me { id email name timezone targetRole avatarUrl backupEmail
    backupEmailVerifiedAt defaultLlmProvider customAiPrompt useCrossApplicationContext
    llmFallbackWhenLimited onboardingChecklistDismissedAt } }";
const UPDATE_PROFILE: &str = "mutation($name: String, $timezone: String, $targetRole: String,
    $customAiPrompt: String, $cross: Boolean, $fallback: Boolean) {
    updateProfile(name: $name, timezone: $timezone, targetRole: $targetRole,
        customAiPrompt: $customAiPrompt, useCrossApplicationContext: $cross,
        llmFallbackWhenLimited: $fallback)
}";
const PREFERENCES: &str = "{ notificationPreferences { weeklyDigestEnabled digestFrequency
    followUpRemindersEnabled pushNotificationsEnabled weeklyApplicationGoal } }";
const UPDATE_PREFERENCES: &str = "mutation($weekly: Boolean, $frequency: DigestFrequency,
    $followUp: Boolean, $push: Boolean, $goal: Int) {
    updateNotificationPreferences(weeklyDigestEnabled: $weekly, digestFrequency: $frequency,
        followUpRemindersEnabled: $followUp, pushNotificationsEnabled: $push,
        weeklyApplicationGoal: $goal)
}";
const REQUEST_AVATAR: &str = "mutation($filename: String!, $mimeType: String!) {
    requestAvatarUploadUrl(filename: $filename, mimeType: $mimeType) { uploadUrl storageKey }
}";
const CONFIRM_AVATAR: &str =
    "mutation($storageKey: String!, $mimeType: String!, $sizeBytes: Int!) {
    confirmAvatar(storageKey: $storageKey, mimeType: $mimeType, sizeBytes: $sizeBytes)
}";

async fn app_with_user() -> (TestApp, String) {
    let app = TestApp::start().await;
    seed_account(&app.db, "ada").await;
    let token = app.access_token("ada");
    (app, token)
}

async fn me(app: &TestApp, token: &str) -> Value {
    app.graphql(ME, json!({}), Auth::Bearer(token)).await.data("me").clone()
}

#[tokio::test]
async fn me_returns_the_profile_as_the_column_defaults_leave_it() {
    let (app, token) = app_with_user().await;

    assert_eq!(
        me(&app, &token).await,
        json!({
            "id": "ada",
            "email": "ada@example.com",
            "name": null,
            "timezone": null,
            "targetRole": null,
            "avatarUrl": null,
            "backupEmail": null,
            "backupEmailVerifiedAt": null,
            "defaultLlmProvider": null,
            "customAiPrompt": null,
            "useCrossApplicationContext": false,
            "llmFallbackWhenLimited": false,
            "onboardingChecklistDismissedAt": null,
        })
    );
}

#[tokio::test]
async fn me_is_null_for_a_token_that_outlived_its_account() {
    let app = TestApp::start().await;
    let token = app.access_token("ghost");

    let response = app.graphql(ME, json!({}), Auth::Bearer(&token)).await;

    assert_eq!(response.data("me"), &Value::Null);
}

#[tokio::test]
async fn every_guarded_operation_refuses_an_anonymous_caller() {
    let (app, _token) = app_with_user().await;
    let operations = [
        ("me", ME, json!({})),
        ("notificationPreferences", PREFERENCES, json!({})),
        ("updateProfile", UPDATE_PROFILE, json!({ "name": "x" })),
        ("updateNotificationPreferences", UPDATE_PREFERENCES, json!({ "goal": 3 })),
        ("dismissOnboardingChecklist", "mutation { dismissOnboardingChecklist }", json!({})),
        ("removeAvatar", "mutation { removeAvatar }", json!({})),
        (
            "requestAvatarUploadUrl",
            REQUEST_AVATAR,
            json!({ "filename": "a.png", "mimeType": "image/png" }),
        ),
        (
            "confirmAvatar",
            CONFIRM_AVATAR,
            json!({ "storageKey": "k", "mimeType": "image/png", "sizeBytes": 1 }),
        ),
    ];

    for (field, query, variables) in operations {
        let response = app.graphql(query, variables, Auth::None).await;
        assert_eq!(response.error_code(), "UNAUTHORIZED", "{field}");
        assert_eq!(response.error_message(), "Unauthorized", "{field}");
        assert_eq!(response.body["data"][field], Value::Null, "{field}");
    }
}

#[tokio::test]
async fn update_profile_sets_trims_clears_and_leaves_alone() {
    let (app, token) = app_with_user().await;

    let set = app
        .graphql(
            UPDATE_PROFILE,
            json!({
                "name": "  Ada Lovelace ",
                "timezone": "Europe/London",
                "targetRole": "Staff Engineer",
                "customAiPrompt": "Be concise.",
                "cross": true,
                "fallback": true,
            }),
            Auth::Bearer(&token),
        )
        .await;
    assert_eq!(set.data("updateProfile"), &Value::Bool(true));

    let profile = me(&app, &token).await;
    assert_eq!(profile["name"], "Ada Lovelace");
    assert_eq!(profile["timezone"], "Europe/London");
    assert_eq!(profile["targetRole"], "Staff Engineer");
    assert_eq!(profile["customAiPrompt"], "Be concise.");
    assert_eq!(profile["useCrossApplicationContext"], true);
    assert_eq!(profile["llmFallbackWhenLimited"], true);

    // An explicit null clears, a blank string clears, an absent argument (and
    // a null boolean) leaves the stored value alone.
    let inline = "mutation { updateProfile(name: null, targetRole: \"   \",
        useCrossApplicationContext: null) }";
    let cleared = app.graphql(inline, json!({}), Auth::Bearer(&token)).await;
    assert_eq!(cleared.data("updateProfile"), &Value::Bool(true));

    let profile = me(&app, &token).await;
    assert_eq!(profile["name"], Value::Null);
    assert_eq!(profile["targetRole"], Value::Null);
    assert_eq!(profile["timezone"], "Europe/London");
    assert_eq!(profile["customAiPrompt"], "Be concise.");
    assert_eq!(profile["useCrossApplicationContext"], true);
}

#[tokio::test]
async fn update_profile_rejects_bad_input_with_the_original_messages() {
    let (app, token) = app_with_user().await;
    let cases = [
        (json!({ "timezone": "Mars/Phobos" }), "Invalid timezone"),
        (json!({ "name": "a".repeat(101) }), "Name is too long"),
        (json!({ "targetRole": "r".repeat(101) }), "Target role is too long"),
        (json!({ "customAiPrompt": "p".repeat(501) }), "AI prompt is too long"),
    ];

    for (variables, message) in cases {
        let response = app.graphql(UPDATE_PROFILE, variables, Auth::Bearer(&token)).await;
        assert_eq!(response.error_code(), "VALIDATION", "{message}");
        assert_eq!(response.error_message(), message);
        assert_eq!(status_code(&response), 400);
    }
    assert_eq!(me(&app, &token).await["name"], Value::Null);
}

#[tokio::test]
async fn update_profile_for_a_deleted_account_is_not_found() {
    let app = TestApp::start().await;
    let token = app.access_token("ghost");

    let response = app.graphql(UPDATE_PROFILE, json!({ "name": "x" }), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "NOT_FOUND");
    assert_eq!(response.error_message(), "User not found");
    assert_eq!(status_code(&response), 404);
}

#[tokio::test]
async fn dismissing_the_onboarding_checklist_stamps_the_time() {
    let (app, token) = app_with_user().await;

    let response = app
        .graphql("mutation { dismissOnboardingChecklist }", json!({}), Auth::Bearer(&token))
        .await;
    assert_eq!(response.data("dismissOnboardingChecklist"), &Value::Bool(true));

    let dismissed_at = me(&app, &token).await["onboardingChecklistDismissedAt"].clone();
    let text = dismissed_at.as_str().unwrap();
    // 2026-01-31T09:30:00.000Z
    assert_eq!(text.len(), 24, "{text}");
    assert!(text.ends_with('Z') && text.as_bytes()[19] == b'.', "{text}");
}

#[tokio::test]
async fn notification_preferences_start_at_the_column_defaults() {
    let (app, token) = app_with_user().await;

    let response = app.graphql(PREFERENCES, json!({}), Auth::Bearer(&token)).await;

    assert_eq!(
        response.data("notificationPreferences"),
        &json!({
            "weeklyDigestEnabled": true,
            "digestFrequency": "weekly",
            "followUpRemindersEnabled": true,
            "pushNotificationsEnabled": false,
            "weeklyApplicationGoal": 5,
        })
    );
}

#[tokio::test]
async fn updating_preferences_takes_the_upper_case_enum_and_stores_lower_case() {
    let (app, token) = app_with_user().await;

    let off = app
        .graphql(
            UPDATE_PREFERENCES,
            // The frequency wins over the on/off switch sent beside it.
            json!({ "frequency": "OFF", "weekly": true, "push": true, "goal": 12 }),
            Auth::Bearer(&token),
        )
        .await;
    assert_eq!(off.data("updateNotificationPreferences"), &Value::Bool(true));

    let preferences = app.graphql(PREFERENCES, json!({}), Auth::Bearer(&token)).await;
    assert_eq!(
        preferences.data("notificationPreferences"),
        &json!({
            "weeklyDigestEnabled": false,
            "digestFrequency": "off",
            "followUpRemindersEnabled": true,
            "pushNotificationsEnabled": true,
            "weeklyApplicationGoal": 12,
        })
    );

    app.graphql(UPDATE_PREFERENCES, json!({ "frequency": "DAILY" }), Auth::Bearer(&token)).await;
    assert_eq!(user_column(&app.db, "ada", "digestFrequency").await.as_deref(), Some("daily"));
    assert_eq!(user_column(&app.db, "ada", "weeklyDigestEnabled").await.as_deref(), Some("true"));
}

#[tokio::test]
async fn a_weekly_goal_outside_1_to_100_is_refused() {
    let (app, token) = app_with_user().await;

    for goal in [0, 101] {
        let response =
            app.graphql(UPDATE_PREFERENCES, json!({ "goal": goal }), Auth::Bearer(&token)).await;
        assert_eq!(response.error_code(), "VALIDATION");
        assert_eq!(response.error_message(), "Weekly application goal must be between 1 and 100");
    }
    assert_eq!(user_column(&app.db, "ada", "weeklyApplicationGoal").await.as_deref(), Some("5"));
}

#[tokio::test]
async fn a_lower_case_digest_frequency_is_not_a_value_of_the_enum() {
    let (app, token) = app_with_user().await;

    let response = app
        .graphql(UPDATE_PREFERENCES, json!({ "frequency": "daily" }), Auth::Bearer(&token))
        .await;

    assert!(response.body.get("errors").is_some(), "{}", response.body);
    assert_eq!(user_column(&app.db, "ada", "digestFrequency").await.as_deref(), Some("weekly"));
}

#[tokio::test]
async fn an_avatar_is_uploaded_confirmed_shown_and_removed() {
    let (app, token) = app_with_user().await;

    let requested = app
        .graphql(
            REQUEST_AVATAR,
            json!({ "filename": "my photo (1).png", "mimeType": "image/png" }),
            Auth::Bearer(&token),
        )
        .await;
    let payload = requested.data("requestAvatarUploadUrl");
    let storage_key = payload["storageKey"].as_str().unwrap().to_string();
    let (prefix, name) = storage_key.split_at("users/ada/avatar/".len());
    assert_eq!(prefix, "users/ada/avatar/");
    // A 21-character nanoid, a hyphen, then the sanitized filename.
    assert_eq!(&name[21..], "-my-photo-1.png", "{storage_key}");
    assert!(payload["uploadUrl"].as_str().unwrap().contains("_upload"), "{payload}");

    let confirmed = app
        .graphql(
            CONFIRM_AVATAR,
            json!({ "storageKey": storage_key, "mimeType": "image/png", "sizeBytes": 2048 }),
            Auth::Bearer(&token),
        )
        .await;
    let url = confirmed.data("confirmAvatar").as_str().unwrap().to_string();
    assert!(url.ends_with("-my-photo-1.png"), "{url}");
    assert_eq!(user_column(&app.db, "ada", "avatarKey").await, Some(storage_key));
    assert_eq!(me(&app, &token).await["avatarUrl"], url.as_str());

    let removed = app.graphql("mutation { removeAvatar }", json!({}), Auth::Bearer(&token)).await;
    assert_eq!(removed.data("removeAvatar"), &Value::Bool(true));
    assert_eq!(user_column(&app.db, "ada", "avatarKey").await, None);
    assert_eq!(me(&app, &token).await["avatarUrl"], Value::Null);

    // Removing again is a no-op, not an error.
    let again = app.graphql("mutation { removeAvatar }", json!({}), Auth::Bearer(&token)).await;
    assert_eq!(again.data("removeAvatar"), &Value::Bool(true));
}

#[tokio::test]
async fn avatar_uploads_are_limited_to_images_of_a_sane_size() {
    let (app, token) = app_with_user().await;

    let wrong_type = app
        .graphql(
            REQUEST_AVATAR,
            json!({ "filename": "cv.pdf", "mimeType": "application/pdf" }),
            Auth::Bearer(&token),
        )
        .await;
    assert_eq!(wrong_type.error_code(), "VALIDATION");
    assert_eq!(wrong_type.error_message(), "Unsupported image type: application/pdf");

    let cases = [
        (0, "Image size must be greater than 0 bytes"),
        (5 * 1024 * 1024 + 1, "Image exceeds the maximum allowed size of 5242880 bytes"),
    ];
    for (size, message) in cases {
        let response = app
            .graphql(
                CONFIRM_AVATAR,
                json!({ "storageKey": "users/ada/avatar/x.png", "mimeType": "image/png", "sizeBytes": size }),
                Auth::Bearer(&token),
            )
            .await;
        assert_eq!(response.error_code(), "VALIDATION");
        assert_eq!(response.error_message(), message);
    }
    assert_eq!(user_column(&app.db, "ada", "avatarKey").await, None);
}
