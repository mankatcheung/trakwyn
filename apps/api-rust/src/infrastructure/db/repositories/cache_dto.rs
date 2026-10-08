//! The JSON the caching decorators store, which has to be `apps/api`'s.
//!
//! Both implementations read and write one Redis during a rollout, so an entry
//! written by either must be readable by the other. `apps/api` stores
//! `JSON.stringify(entity)`: camelCase field names, `null` for an absent
//! value, and timestamps as `Date.prototype.toISOString()` strings (which its
//! `reviveDates` turns back into `Date`s on a hit). Domain entities carry no
//! serde derives, so each gets a DTO here that serializes to exactly that and
//! converts to and from the entity.
//!
//! An entry that does not deserialize (a field missing, an enum value this
//! build does not know) makes `get_or_set` fall back to the inner repository,
//! so every enum field is validated while deserializing rather than after it.

use std::future::Future;

use chrono::{DateTime, Utc};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::domain::api_token::{ApiToken, ApiTokenScope};
use crate::domain::application::{Application, ApplicationStatus};
use crate::domain::contact::Contact;
use crate::domain::document::Document;
use crate::domain::education::Education;
use crate::domain::interview_round::{InterviewRound, InterviewRoundOutcome, InterviewRoundType};
use crate::domain::note::Note;
use crate::domain::skill::Skill;
use crate::domain::user::{DigestFrequency, User};
use crate::domain::work_experience::WorkExperience;
use crate::infrastructure::cache::{Cache, CacheExt};
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::ApiTokenWithUserEmail;

#[cfg(test)]
mod fixtures;
#[cfg(test)]
mod tests;

/// An entity and the DTO that is its cached form.
pub(super) trait CacheDto: Serialize + DeserializeOwned + Send {
    type Entity;
    fn from_entity(entity: Self::Entity) -> Self;
    fn into_entity(self) -> Self::Entity;
}

/// `get_or_set` for a single entity (or its absence, which is cached too).
pub(super) async fn cached_option<D, F, Fut>(
    cache: &dyn Cache,
    key: &str,
    fetch: F,
) -> DomainResult<Option<D::Entity>>
where
    D: CacheDto,
    F: Fn() -> Fut + Send + Sync,
    Fut: Future<Output = DomainResult<Option<D::Entity>>> + Send,
{
    let cached: Option<D> =
        cache.get_or_set(key, || async { Ok(fetch().await?.map(D::from_entity)) }, None).await?;
    Ok(cached.map(D::into_entity))
}

/// `get_or_set` for a list of entities.
pub(super) async fn cached_list<D, F, Fut>(
    cache: &dyn Cache,
    key: &str,
    fetch: F,
) -> DomainResult<Vec<D::Entity>>
where
    D: CacheDto,
    F: Fn() -> Fut + Send + Sync,
    Fut: Future<Output = DomainResult<Vec<D::Entity>>> + Send,
{
    let cached: Vec<D> = cache
        .get_or_set(
            key,
            || async { Ok(fetch().await?.into_iter().map(D::from_entity).collect()) },
            None,
        )
        .await?;
    Ok(cached.into_iter().map(D::into_entity).collect())
}

/// `toISOString()`: always three fractional digits and a `Z`.
mod iso {
    use chrono::{DateTime, SecondsFormat, Utc};
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(
        value: &DateTime<Utc>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&value.to_rfc3339_opts(SecondsFormat::Millis, true))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<DateTime<Utc>, D::Error> {
        DateTime::<Utc>::deserialize(deserializer)
    }
}

/// [`iso`] for a nullable column: `null` both ways.
mod iso_opt {
    use chrono::{DateTime, SecondsFormat, Utc};
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(
        value: &Option<DateTime<Utc>>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        match value {
            Some(value) => {
                serializer.serialize_str(&value.to_rfc3339_opts(SecondsFormat::Millis, true))
            }
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Option<DateTime<Utc>>, D::Error> {
        Option::<DateTime<Utc>>::deserialize(deserializer)
    }
}

/// A `#[serde(with = …)]` module for a closed string union, which refuses a
/// value outside it.
macro_rules! string_enum {
    ($module:ident, $ty:ty) => {
        mod $module {
            use serde::de::Error;
            use serde::{Deserialize, Deserializer, Serializer};

            use super::*;

            pub fn serialize<S: Serializer>(value: &$ty, serializer: S) -> Result<S::Ok, S::Error> {
                serializer.serialize_str(value.as_str())
            }

            pub fn deserialize<'de, D: Deserializer<'de>>(
                deserializer: D,
            ) -> Result<$ty, D::Error> {
                let raw = String::deserialize(deserializer)?;
                <$ty>::parse(&raw)
                    .ok_or_else(|| D::Error::custom(concat!("unknown ", stringify!($ty))))
            }
        }
    };
}

string_enum!(api_token_scope, ApiTokenScope);
string_enum!(application_status, ApplicationStatus);
string_enum!(digest_frequency, DigestFrequency);
string_enum!(round_type, InterviewRoundType);
string_enum!(round_outcome, InterviewRoundOutcome);

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ApiTokenDto {
    id: String,
    user_id: String,
    name: String,
    token_hash: String,
    #[serde(with = "api_token_scope")]
    scope: ApiTokenScope,
    #[serde(with = "iso_opt")]
    last_used_at: Option<DateTime<Utc>>,
    #[serde(with = "iso")]
    created_at: DateTime<Utc>,
}

impl CacheDto for ApiTokenDto {
    type Entity = ApiToken;

    fn from_entity(token: ApiToken) -> Self {
        Self {
            id: token.id,
            user_id: token.user_id,
            name: token.name,
            token_hash: token.token_hash,
            scope: token.scope,
            last_used_at: token.last_used_at,
            created_at: token.created_at,
        }
    }

    fn into_entity(self) -> ApiToken {
        ApiToken {
            id: self.id,
            user_id: self.user_id,
            name: self.name,
            token_hash: self.token_hash,
            scope: self.scope,
            last_used_at: self.last_used_at,
            created_at: self.created_at,
        }
    }
}

/// `findByTokenHash` caches `{ token, userEmail }`.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ApiTokenWithUserEmailDto {
    token: ApiTokenDto,
    user_email: String,
}

impl CacheDto for ApiTokenWithUserEmailDto {
    type Entity = ApiTokenWithUserEmail;

    fn from_entity(found: ApiTokenWithUserEmail) -> Self {
        Self { token: ApiTokenDto::from_entity(found.token), user_email: found.user_email }
    }

    fn into_entity(self) -> ApiTokenWithUserEmail {
        ApiTokenWithUserEmail { token: self.token.into_entity(), user_email: self.user_email }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ApplicationDto {
    id: String,
    user_id: String,
    company: String,
    role: String,
    #[serde(with = "application_status")]
    status: ApplicationStatus,
    job_url: Option<String>,
    location: Option<String>,
    salary_range: Option<String>,
    description: Option<String>,
    #[serde(with = "iso_opt")]
    applied_at: Option<DateTime<Utc>>,
    starred: bool,
    source: Option<String>,
    #[serde(with = "iso_opt")]
    follow_up_at: Option<DateTime<Utc>>,
    tags: Vec<String>,
    #[serde(with = "iso_opt")]
    reminder_sent_at: Option<DateTime<Utc>>,
    board_position: i32,
    #[serde(with = "iso_opt")]
    deleted_at: Option<DateTime<Utc>>,
    #[serde(with = "iso")]
    created_at: DateTime<Utc>,
    #[serde(with = "iso")]
    updated_at: DateTime<Utc>,
}

impl CacheDto for ApplicationDto {
    type Entity = Application;

    fn from_entity(app: Application) -> Self {
        Self {
            id: app.id,
            user_id: app.user_id,
            company: app.company,
            role: app.role,
            status: app.status,
            job_url: app.job_url,
            location: app.location,
            salary_range: app.salary_range,
            description: app.description,
            applied_at: app.applied_at,
            starred: app.starred,
            source: app.source,
            follow_up_at: app.follow_up_at,
            tags: app.tags,
            reminder_sent_at: app.reminder_sent_at,
            board_position: app.board_position,
            deleted_at: app.deleted_at,
            created_at: app.created_at,
            updated_at: app.updated_at,
        }
    }

    fn into_entity(self) -> Application {
        Application {
            id: self.id,
            user_id: self.user_id,
            company: self.company,
            role: self.role,
            status: self.status,
            job_url: self.job_url,
            location: self.location,
            salary_range: self.salary_range,
            description: self.description,
            applied_at: self.applied_at,
            starred: self.starred,
            source: self.source,
            follow_up_at: self.follow_up_at,
            tags: self.tags,
            reminder_sent_at: self.reminder_sent_at,
            board_position: self.board_position,
            deleted_at: self.deleted_at,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UserDto {
    id: String,
    email: String,
    password_hash: Option<String>,
    name: Option<String>,
    timezone: Option<String>,
    target_role: Option<String>,
    #[serde(with = "iso_opt")]
    email_verified_at: Option<DateTime<Utc>>,
    avatar_key: Option<String>,
    weekly_digest_enabled: bool,
    #[serde(with = "digest_frequency")]
    digest_frequency: DigestFrequency,
    #[serde(with = "iso_opt")]
    last_digest_sent_at: Option<DateTime<Utc>>,
    follow_up_reminders_enabled: bool,
    push_notifications_enabled: bool,
    weekly_application_goal: i32,
    totp_secret: Option<String>,
    totp_enabled: bool,
    default_llm_provider: Option<String>,
    custom_ai_prompt: Option<String>,
    use_cross_application_context: bool,
    llm_fallback_when_limited: bool,
    backup_email: Option<String>,
    #[serde(with = "iso_opt")]
    backup_email_verified_at: Option<DateTime<Utc>>,
    #[serde(with = "iso_opt")]
    onboarding_checklist_dismissed_at: Option<DateTime<Utc>>,
    #[serde(with = "iso")]
    created_at: DateTime<Utc>,
    #[serde(with = "iso")]
    updated_at: DateTime<Utc>,
}

impl CacheDto for UserDto {
    type Entity = User;

    fn from_entity(user: User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            password_hash: user.password_hash,
            name: user.name,
            timezone: user.timezone,
            target_role: user.target_role,
            email_verified_at: user.email_verified_at,
            avatar_key: user.avatar_key,
            weekly_digest_enabled: user.weekly_digest_enabled,
            digest_frequency: user.digest_frequency,
            last_digest_sent_at: user.last_digest_sent_at,
            follow_up_reminders_enabled: user.follow_up_reminders_enabled,
            push_notifications_enabled: user.push_notifications_enabled,
            weekly_application_goal: user.weekly_application_goal,
            totp_secret: user.totp_secret,
            totp_enabled: user.totp_enabled,
            default_llm_provider: user.default_llm_provider,
            custom_ai_prompt: user.custom_ai_prompt,
            use_cross_application_context: user.use_cross_application_context,
            llm_fallback_when_limited: user.llm_fallback_when_limited,
            backup_email: user.backup_email,
            backup_email_verified_at: user.backup_email_verified_at,
            onboarding_checklist_dismissed_at: user.onboarding_checklist_dismissed_at,
            created_at: user.created_at,
            updated_at: user.updated_at,
        }
    }

    fn into_entity(self) -> User {
        User {
            id: self.id,
            email: self.email,
            password_hash: self.password_hash,
            name: self.name,
            timezone: self.timezone,
            target_role: self.target_role,
            email_verified_at: self.email_verified_at,
            avatar_key: self.avatar_key,
            weekly_digest_enabled: self.weekly_digest_enabled,
            digest_frequency: self.digest_frequency,
            last_digest_sent_at: self.last_digest_sent_at,
            follow_up_reminders_enabled: self.follow_up_reminders_enabled,
            push_notifications_enabled: self.push_notifications_enabled,
            weekly_application_goal: self.weekly_application_goal,
            totp_secret: self.totp_secret,
            totp_enabled: self.totp_enabled,
            default_llm_provider: self.default_llm_provider,
            custom_ai_prompt: self.custom_ai_prompt,
            use_cross_application_context: self.use_cross_application_context,
            llm_fallback_when_limited: self.llm_fallback_when_limited,
            backup_email: self.backup_email,
            backup_email_verified_at: self.backup_email_verified_at,
            onboarding_checklist_dismissed_at: self.onboarding_checklist_dismissed_at,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct NoteDto {
    id: String,
    application_id: String,
    content: String,
    #[serde(with = "iso")]
    created_at: DateTime<Utc>,
    #[serde(with = "iso")]
    updated_at: DateTime<Utc>,
}

impl CacheDto for NoteDto {
    type Entity = Note;

    fn from_entity(note: Note) -> Self {
        Self {
            id: note.id,
            application_id: note.application_id,
            content: note.content,
            created_at: note.created_at,
            updated_at: note.updated_at,
        }
    }

    fn into_entity(self) -> Note {
        Note {
            id: self.id,
            application_id: self.application_id,
            content: self.content,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DocumentDto {
    id: String,
    application_id: String,
    name: String,
    mime_type: String,
    size_bytes: i32,
    storage_key: String,
    document_type: String,
    version: Option<String>,
    source_draft_id: Option<String>,
    #[serde(with = "iso")]
    created_at: DateTime<Utc>,
}

impl CacheDto for DocumentDto {
    type Entity = Document;

    fn from_entity(document: Document) -> Self {
        Self {
            id: document.id,
            application_id: document.application_id,
            name: document.name,
            mime_type: document.mime_type,
            size_bytes: document.size_bytes,
            storage_key: document.storage_key,
            document_type: document.document_type,
            version: document.version,
            source_draft_id: document.source_draft_id,
            created_at: document.created_at,
        }
    }

    fn into_entity(self) -> Document {
        Document {
            id: self.id,
            application_id: self.application_id,
            name: self.name,
            mime_type: self.mime_type,
            size_bytes: self.size_bytes,
            storage_key: self.storage_key,
            document_type: self.document_type,
            version: self.version,
            source_draft_id: self.source_draft_id,
            created_at: self.created_at,
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ContactDto {
    id: String,
    application_id: String,
    name: String,
    role: Option<String>,
    email: Option<String>,
    phone: Option<String>,
    linkedin_url: Option<String>,
    notes: Option<String>,
    #[serde(with = "iso")]
    created_at: DateTime<Utc>,
    #[serde(with = "iso")]
    updated_at: DateTime<Utc>,
}

impl CacheDto for ContactDto {
    type Entity = Contact;

    fn from_entity(contact: Contact) -> Self {
        Self {
            id: contact.id,
            application_id: contact.application_id,
            name: contact.name,
            role: contact.role,
            email: contact.email,
            phone: contact.phone,
            linkedin_url: contact.linkedin_url,
            notes: contact.notes,
            created_at: contact.created_at,
            updated_at: contact.updated_at,
        }
    }

    fn into_entity(self) -> Contact {
        Contact {
            id: self.id,
            application_id: self.application_id,
            name: self.name,
            role: self.role,
            email: self.email,
            phone: self.phone,
            linkedin_url: self.linkedin_url,
            notes: self.notes,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct EducationDto {
    id: String,
    user_id: String,
    institution: String,
    degree: Option<String>,
    field: Option<String>,
    #[serde(with = "iso")]
    start_date: DateTime<Utc>,
    #[serde(with = "iso_opt")]
    end_date: Option<DateTime<Utc>>,
    description: Option<String>,
    #[serde(with = "iso")]
    created_at: DateTime<Utc>,
    #[serde(with = "iso")]
    updated_at: DateTime<Utc>,
}

impl CacheDto for EducationDto {
    type Entity = Education;

    fn from_entity(education: Education) -> Self {
        Self {
            id: education.id,
            user_id: education.user_id,
            institution: education.institution,
            degree: education.degree,
            field: education.field,
            start_date: education.start_date,
            end_date: education.end_date,
            description: education.description,
            created_at: education.created_at,
            updated_at: education.updated_at,
        }
    }

    fn into_entity(self) -> Education {
        Education {
            id: self.id,
            user_id: self.user_id,
            institution: self.institution,
            degree: self.degree,
            field: self.field,
            start_date: self.start_date,
            end_date: self.end_date,
            description: self.description,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SkillDto {
    id: String,
    user_id: String,
    name: String,
    category: Option<String>,
    proficiency: Option<String>,
    #[serde(with = "iso")]
    created_at: DateTime<Utc>,
}

impl CacheDto for SkillDto {
    type Entity = Skill;

    fn from_entity(skill: Skill) -> Self {
        Self {
            id: skill.id,
            user_id: skill.user_id,
            name: skill.name,
            category: skill.category,
            proficiency: skill.proficiency,
            created_at: skill.created_at,
        }
    }

    fn into_entity(self) -> Skill {
        Skill {
            id: self.id,
            user_id: self.user_id,
            name: self.name,
            category: self.category,
            proficiency: self.proficiency,
            created_at: self.created_at,
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WorkExperienceDto {
    id: String,
    user_id: String,
    company: String,
    title: String,
    location: Option<String>,
    #[serde(with = "iso")]
    start_date: DateTime<Utc>,
    #[serde(with = "iso_opt")]
    end_date: Option<DateTime<Utc>>,
    description: Option<String>,
    #[serde(with = "iso")]
    created_at: DateTime<Utc>,
    #[serde(with = "iso")]
    updated_at: DateTime<Utc>,
}

impl CacheDto for WorkExperienceDto {
    type Entity = WorkExperience;

    fn from_entity(work: WorkExperience) -> Self {
        Self {
            id: work.id,
            user_id: work.user_id,
            company: work.company,
            title: work.title,
            location: work.location,
            start_date: work.start_date,
            end_date: work.end_date,
            description: work.description,
            created_at: work.created_at,
            updated_at: work.updated_at,
        }
    }

    fn into_entity(self) -> WorkExperience {
        WorkExperience {
            id: self.id,
            user_id: self.user_id,
            company: self.company,
            title: self.title,
            location: self.location,
            start_date: self.start_date,
            end_date: self.end_date,
            description: self.description,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct InterviewRoundDto {
    id: String,
    application_id: String,
    #[serde(rename = "type", with = "round_type")]
    round_type: InterviewRoundType,
    #[serde(with = "iso_opt")]
    scheduled_at: Option<DateTime<Utc>>,
    #[serde(with = "iso_opt")]
    completed_at: Option<DateTime<Utc>>,
    interviewer_name: Option<String>,
    notes: Option<String>,
    #[serde(with = "round_outcome")]
    outcome: InterviewRoundOutcome,
    #[serde(with = "iso_opt")]
    push_notification_sent_at: Option<DateTime<Utc>>,
    #[serde(with = "iso")]
    created_at: DateTime<Utc>,
    #[serde(with = "iso")]
    updated_at: DateTime<Utc>,
}

impl CacheDto for InterviewRoundDto {
    type Entity = InterviewRound;

    fn from_entity(round: InterviewRound) -> Self {
        Self {
            id: round.id,
            application_id: round.application_id,
            round_type: round.r#type,
            scheduled_at: round.scheduled_at,
            completed_at: round.completed_at,
            interviewer_name: round.interviewer_name,
            notes: round.notes,
            outcome: round.outcome,
            push_notification_sent_at: round.push_notification_sent_at,
            created_at: round.created_at,
            updated_at: round.updated_at,
        }
    }

    fn into_entity(self) -> InterviewRound {
        InterviewRound {
            id: self.id,
            application_id: self.application_id,
            r#type: self.round_type,
            scheduled_at: self.scheduled_at,
            completed_at: self.completed_at,
            interviewer_name: self.interviewer_name,
            notes: self.notes,
            outcome: self.outcome,
            push_notification_sent_at: self.push_notification_sent_at,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}
