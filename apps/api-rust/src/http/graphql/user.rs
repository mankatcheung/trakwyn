//! The signed-in user's profile, avatar and notification preferences.

use async_graphql::{Context, MaybeUndefined, Object, Result, SimpleObject, ID};

use super::enums::DigestFrequencyEnum;
use super::support::{container, iso, require_user};
use crate::domain::user::User;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::user::{
    ConfirmAvatarInput, NotificationPreferences, RequestAvatarUploadUrlInput,
    UpdateNotificationPreferencesInput, UpdateProfileInput,
};

#[derive(SimpleObject)]
#[graphql(name = "User")]
pub struct UserObject {
    id: Option<ID>,
    email: Option<String>,
    name: Option<String>,
    timezone: Option<String>,
    target_role: Option<String>,
    avatar_url: Option<String>,
    backup_email: Option<String>,
    backup_email_verified_at: Option<String>,
    default_llm_provider: Option<String>,
    custom_ai_prompt: Option<String>,
    use_cross_application_context: Option<bool>,
    llm_fallback_when_limited: Option<bool>,
    onboarding_checklist_dismissed_at: Option<String>,
}

impl UserObject {
    /// `avatar_url` is the signed URL of the user's avatar, resolved by the
    /// caller: the stored key is never sent.
    fn new(user: User, avatar_url: Option<String>) -> Self {
        Self {
            id: Some(ID(user.id)),
            email: Some(user.email),
            name: user.name,
            timezone: user.timezone,
            target_role: user.target_role,
            avatar_url,
            backup_email: user.backup_email,
            backup_email_verified_at: user.backup_email_verified_at.map(iso),
            default_llm_provider: user.default_llm_provider,
            custom_ai_prompt: user.custom_ai_prompt,
            use_cross_application_context: Some(user.use_cross_application_context),
            llm_fallback_when_limited: Some(user.llm_fallback_when_limited),
            onboarding_checklist_dismissed_at: user.onboarding_checklist_dismissed_at.map(iso),
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "NotificationPreferences")]
pub struct NotificationPreferencesObject {
    weekly_digest_enabled: Option<bool>,
    // The stored lower-case value, not the `DigestFrequency` enum.
    digest_frequency: Option<String>,
    follow_up_reminders_enabled: Option<bool>,
    push_notifications_enabled: Option<bool>,
    weekly_application_goal: Option<i32>,
}

impl From<NotificationPreferences> for NotificationPreferencesObject {
    fn from(preferences: NotificationPreferences) -> Self {
        Self {
            weekly_digest_enabled: Some(preferences.weekly_digest_enabled),
            digest_frequency: Some(preferences.digest_frequency.as_str().to_string()),
            follow_up_reminders_enabled: Some(preferences.follow_up_reminders_enabled),
            push_notifications_enabled: Some(preferences.push_notifications_enabled),
            weekly_application_goal: Some(preferences.weekly_application_goal),
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "UploadUrlPayload")]
pub struct UploadUrlPayloadObject {
    pub upload_url: Option<String>,
    pub storage_key: Option<String>,
}

/// A nullable text argument: absent leaves the field alone, null clears it.
fn text(value: MaybeUndefined<String>) -> Option<Option<String>> {
    match value {
        MaybeUndefined::Undefined => None,
        MaybeUndefined::Null => Some(None),
        MaybeUndefined::Value(value) => Some(Some(value)),
    }
}

#[derive(Default)]
pub struct UserQuery;

#[Object]
impl UserQuery {
    // Null when the token outlived its account. (A doc comment here would
    // become a GraphQL description the contract does not have.)
    async fn me(&self, ctx: &Context<'_>) -> Result<Option<UserObject>> {
        let user = require_user(ctx)?;
        let container = container(ctx);
        let Some(found) = container.get_user_use_case().execute(&user.sub).await.gql()? else {
            return Ok(None);
        };
        let avatar_url = match found.avatar_key.as_deref().filter(|key| !key.is_empty()) {
            Some(key) => {
                Some(container.services.storage_provider.get_signed_url(key, None).await.gql()?)
            }
            None => None,
        };
        Ok(Some(UserObject::new(found, avatar_url)))
    }

    async fn notification_preferences(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<NotificationPreferencesObject>> {
        let user = require_user(ctx)?;
        let preferences = container(ctx)
            .get_notification_preferences_use_case()
            .execute(&user.sub)
            .await
            .gql()?;
        Ok(Some(preferences.into()))
    }
}

#[derive(Default)]
pub struct UserMutation;

#[Object]
impl UserMutation {
    #[allow(clippy::too_many_arguments)]
    async fn update_profile(
        &self,
        ctx: &Context<'_>,
        name: MaybeUndefined<String>,
        timezone: MaybeUndefined<String>,
        target_role: MaybeUndefined<String>,
        custom_ai_prompt: MaybeUndefined<String>,
        use_cross_application_context: Option<bool>,
        llm_fallback_when_limited: Option<bool>,
    ) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .update_profile_use_case()
            .execute(UpdateProfileInput {
                user_id: user.sub.clone(),
                name: text(name),
                timezone: text(timezone),
                target_role: text(target_role),
                custom_ai_prompt: text(custom_ai_prompt),
                use_cross_application_context,
                llm_fallback_when_limited,
            })
            .await
            .gql()?;
        Ok(Some(true))
    }

    async fn dismiss_onboarding_checklist(&self, ctx: &Context<'_>) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx).dismiss_onboarding_checklist_use_case().execute(&user.sub).await.gql()?;
        Ok(Some(true))
    }

    async fn request_avatar_upload_url(
        &self,
        ctx: &Context<'_>,
        filename: String,
        mime_type: String,
    ) -> Result<Option<UploadUrlPayloadObject>> {
        let user = require_user(ctx)?;
        let output = container(ctx)
            .request_avatar_upload_url_use_case()
            .execute(RequestAvatarUploadUrlInput { user_id: user.sub.clone(), filename, mime_type })
            .await
            .gql()?;
        Ok(Some(UploadUrlPayloadObject {
            upload_url: Some(output.upload_url),
            storage_key: Some(output.storage_key),
        }))
    }

    // Answers the signed URL of the avatar just confirmed.
    async fn confirm_avatar(
        &self,
        ctx: &Context<'_>,
        storage_key: String,
        mime_type: String,
        size_bytes: i32,
    ) -> Result<Option<String>> {
        let user = require_user(ctx)?;
        let container = container(ctx);
        container
            .confirm_avatar_use_case()
            .execute(ConfirmAvatarInput {
                user_id: user.sub.clone(),
                storage_key: storage_key.clone(),
                mime_type,
                size_bytes,
            })
            .await
            .gql()?;
        let url = container.services.storage_provider.get_signed_url(&storage_key, None).await;
        Ok(Some(url.gql()?))
    }

    async fn remove_avatar(&self, ctx: &Context<'_>) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx).remove_avatar_use_case().execute(&user.sub).await.gql()?;
        Ok(Some(true))
    }

    async fn update_notification_preferences(
        &self,
        ctx: &Context<'_>,
        weekly_digest_enabled: Option<bool>,
        digest_frequency: Option<DigestFrequencyEnum>,
        follow_up_reminders_enabled: Option<bool>,
        push_notifications_enabled: Option<bool>,
        weekly_application_goal: Option<i32>,
    ) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .update_notification_preferences_use_case()
            .execute(UpdateNotificationPreferencesInput {
                user_id: user.sub.clone(),
                weekly_digest_enabled,
                digest_frequency: digest_frequency.map(Into::into),
                follow_up_reminders_enabled,
                push_notifications_enabled,
                weekly_application_goal,
            })
            .await
            .gql()?;
        Ok(Some(true))
    }
}
