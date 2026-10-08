//! GraphQL enums more than one resolver module uses. One block per enum.
use crate::domain::oauth_account::OAuthProviderName;

use async_graphql::Enum;

use crate::domain::application::ApplicationStatus;
use crate::domain::interview_round::InterviewRoundType;

// ── ApplicationStatus ───────────────────────────────────────────────────────

#[derive(Enum, Debug, Clone, Copy, PartialEq, Eq)]
#[graphql(name = "ApplicationStatus", rename_items = "lowercase")]
pub enum ApplicationStatusEnum {
    Draft,
    Applied,
    Interviewing,
    Offered,
    Accepted,
    Rejected,
    Withdrawn,
}

impl From<ApplicationStatus> for ApplicationStatusEnum {
    fn from(status: ApplicationStatus) -> Self {
        match status {
            ApplicationStatus::Draft => Self::Draft,
            ApplicationStatus::Applied => Self::Applied,
            ApplicationStatus::Interviewing => Self::Interviewing,
            ApplicationStatus::Offered => Self::Offered,
            ApplicationStatus::Accepted => Self::Accepted,
            ApplicationStatus::Rejected => Self::Rejected,
            ApplicationStatus::Withdrawn => Self::Withdrawn,
        }
    }
}

impl From<ApplicationStatusEnum> for ApplicationStatus {
    fn from(status: ApplicationStatusEnum) -> Self {
        match status {
            ApplicationStatusEnum::Draft => Self::Draft,
            ApplicationStatusEnum::Applied => Self::Applied,
            ApplicationStatusEnum::Interviewing => Self::Interviewing,
            ApplicationStatusEnum::Offered => Self::Offered,
            ApplicationStatusEnum::Accepted => Self::Accepted,
            ApplicationStatusEnum::Rejected => Self::Rejected,
            ApplicationStatusEnum::Withdrawn => Self::Withdrawn,
        }
    }
}

// ── InterviewRoundType ──────────────────────────────────────────────────────

#[derive(Enum, Debug, Clone, Copy, PartialEq, Eq)]
#[graphql(name = "InterviewRoundType", rename_items = "lowercase")]
pub enum InterviewRoundTypeEnum {
    Phone,
    Technical,
    Onsite,
    Hr,
    Other,
}

impl From<InterviewRoundType> for InterviewRoundTypeEnum {
    fn from(round_type: InterviewRoundType) -> Self {
        match round_type {
            InterviewRoundType::Phone => Self::Phone,
            InterviewRoundType::Technical => Self::Technical,
            InterviewRoundType::Onsite => Self::Onsite,
            InterviewRoundType::Hr => Self::Hr,
            InterviewRoundType::Other => Self::Other,
        }
    }
}

impl From<InterviewRoundTypeEnum> for InterviewRoundType {
    fn from(round_type: InterviewRoundTypeEnum) -> Self {
        match round_type {
            InterviewRoundTypeEnum::Phone => Self::Phone,
            InterviewRoundTypeEnum::Technical => Self::Technical,
            InterviewRoundTypeEnum::Onsite => Self::Onsite,
            InterviewRoundTypeEnum::Hr => Self::Hr,
            InterviewRoundTypeEnum::Other => Self::Other,
        }
    }
}

#[derive(async_graphql::Enum, Debug, Clone, Copy, PartialEq, Eq)]
#[graphql(name = "OAuthProvider", rename_items = "lowercase")]
pub enum OAuthProviderEnum {
    Google,
    Github,
}

impl From<OAuthProviderEnum> for OAuthProviderName {
    fn from(provider: OAuthProviderEnum) -> Self {
        match provider {
            OAuthProviderEnum::Google => Self::Google,
            OAuthProviderEnum::Github => Self::Github,
        }
    }
}

impl From<OAuthProviderName> for OAuthProviderEnum {
    fn from(provider: OAuthProviderName) -> Self {
        match provider {
            OAuthProviderName::Google => Self::Google,
            OAuthProviderName::Github => Self::Github,
        }
    }
}

#[derive(async_graphql::Enum, Clone, Copy, Debug, PartialEq, Eq)]
#[graphql(name = "DigestFrequency")]
pub enum DigestFrequencyEnum {
    #[graphql(name = "DAILY")]
    Daily,
    #[graphql(name = "WEEKLY")]
    Weekly,
    #[graphql(name = "OFF")]
    Off,
}

impl From<DigestFrequencyEnum> for crate::domain::user::DigestFrequency {
    fn from(value: DigestFrequencyEnum) -> Self {
        match value {
            DigestFrequencyEnum::Daily => Self::Daily,
            DigestFrequencyEnum::Weekly => Self::Weekly,
            DigestFrequencyEnum::Off => Self::Off,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn application_status_round_trips_and_keeps_the_stored_spelling() {
        for status in ApplicationStatus::ALL {
            let exposed = ApplicationStatusEnum::from(status);
            assert_eq!(ApplicationStatus::from(exposed), status);
            assert_eq!(
                async_graphql::resolver_utils::enum_value(exposed).to_string(),
                status.as_str()
            );
        }
    }

    #[test]
    fn interview_round_type_round_trips_and_keeps_the_stored_spelling() {
        for round_type in InterviewRoundType::ALL {
            let exposed = InterviewRoundTypeEnum::from(round_type);
            assert_eq!(InterviewRoundType::from(exposed), round_type);
            assert_eq!(
                async_graphql::resolver_utils::enum_value(exposed).to_string(),
                round_type.as_str()
            );
        }
    }
}

#[derive(async_graphql::Enum, Clone, Copy, PartialEq, Eq)]
#[graphql(name = "InterviewRoundOutcome", rename_items = "lowercase")]
pub enum InterviewRoundOutcomeEnum {
    Pending,
    Passed,
    Failed,
    Cancelled,
}

impl From<crate::domain::interview_round::InterviewRoundOutcome> for InterviewRoundOutcomeEnum {
    fn from(value: crate::domain::interview_round::InterviewRoundOutcome) -> Self {
        use crate::domain::interview_round::InterviewRoundOutcome as Domain;
        match value {
            Domain::Pending => Self::Pending,
            Domain::Passed => Self::Passed,
            Domain::Failed => Self::Failed,
            Domain::Cancelled => Self::Cancelled,
        }
    }
}

impl From<InterviewRoundOutcomeEnum> for crate::domain::interview_round::InterviewRoundOutcome {
    fn from(value: InterviewRoundOutcomeEnum) -> Self {
        match value {
            InterviewRoundOutcomeEnum::Pending => Self::Pending,
            InterviewRoundOutcomeEnum::Passed => Self::Passed,
            InterviewRoundOutcomeEnum::Failed => Self::Failed,
            InterviewRoundOutcomeEnum::Cancelled => Self::Cancelled,
        }
    }
}

#[derive(Enum, Debug, Clone, Copy, PartialEq, Eq)]
#[graphql(name = "ApiTokenScope", rename_items = "lowercase")]
pub enum ApiTokenScope {
    Full,
    Read,
}

impl From<crate::domain::api_token::ApiTokenScope> for ApiTokenScope {
    fn from(scope: crate::domain::api_token::ApiTokenScope) -> Self {
        match scope {
            crate::domain::api_token::ApiTokenScope::Full => Self::Full,
            crate::domain::api_token::ApiTokenScope::Read => Self::Read,
        }
    }
}

impl From<ApiTokenScope> for crate::domain::api_token::ApiTokenScope {
    fn from(scope: ApiTokenScope) -> Self {
        match scope {
            ApiTokenScope::Full => Self::Full,
            ApiTokenScope::Read => Self::Read,
        }
    }
}

// ── ActivityEventType ───────────────────────────────────────────────────────

/// In the contract but referenced by no field (`ActivityLog.eventType` is a
/// string), so `build_schema` registers it explicitly.
#[derive(Enum, Debug, Clone, Copy, PartialEq, Eq)]
#[graphql(name = "ActivityEventType")]
pub enum ActivityEventTypeEnum {
    #[graphql(name = "document_deleted")]
    DocumentDeleted,
    #[graphql(name = "document_uploaded")]
    DocumentUploaded,
    #[graphql(name = "field_updated")]
    FieldUpdated,
    #[graphql(name = "interview_added")]
    InterviewAdded,
    #[graphql(name = "note_added")]
    NoteAdded,
    #[graphql(name = "note_deleted")]
    NoteDeleted,
    #[graphql(name = "status_changed")]
    StatusChanged,
}

#[cfg(test)]
mod api_token_scope_tests {
    use super::*;

    #[test]
    fn api_token_scope_round_trips_through_the_domain() {
        for scope in crate::domain::api_token::ApiTokenScope::ALL {
            let graphql = ApiTokenScope::from(scope);
            assert_eq!(crate::domain::api_token::ApiTokenScope::from(graphql), scope);
        }
    }
}
