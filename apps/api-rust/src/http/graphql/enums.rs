//! GraphQL enums shared by more than one resolver module.

use async_graphql::Enum;

use crate::domain::api_token;
use crate::domain::application;

// ---------------------------------------------------------------------------
// ApplicationStatus
// ---------------------------------------------------------------------------

#[derive(Enum, Debug, Clone, Copy, PartialEq, Eq)]
#[graphql(name = "ApplicationStatus", rename_items = "lowercase")]
pub enum ApplicationStatus {
    Draft,
    Applied,
    Interviewing,
    Offered,
    Accepted,
    Rejected,
    Withdrawn,
}

impl From<application::ApplicationStatus> for ApplicationStatus {
    fn from(status: application::ApplicationStatus) -> Self {
        match status {
            application::ApplicationStatus::Draft => Self::Draft,
            application::ApplicationStatus::Applied => Self::Applied,
            application::ApplicationStatus::Interviewing => Self::Interviewing,
            application::ApplicationStatus::Offered => Self::Offered,
            application::ApplicationStatus::Accepted => Self::Accepted,
            application::ApplicationStatus::Rejected => Self::Rejected,
            application::ApplicationStatus::Withdrawn => Self::Withdrawn,
        }
    }
}

impl From<ApplicationStatus> for application::ApplicationStatus {
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

// ---------------------------------------------------------------------------
// ApiTokenScope
// ---------------------------------------------------------------------------

#[derive(Enum, Debug, Clone, Copy, PartialEq, Eq)]
#[graphql(name = "ApiTokenScope", rename_items = "lowercase")]
pub enum ApiTokenScope {
    Full,
    Read,
}

impl From<api_token::ApiTokenScope> for ApiTokenScope {
    fn from(scope: api_token::ApiTokenScope) -> Self {
        match scope {
            api_token::ApiTokenScope::Full => Self::Full,
            api_token::ApiTokenScope::Read => Self::Read,
        }
    }
}

impl From<ApiTokenScope> for api_token::ApiTokenScope {
    fn from(scope: ApiTokenScope) -> Self {
        match scope {
            ApiTokenScope::Full => Self::Full,
            ApiTokenScope::Read => Self::Read,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn application_status_round_trips_through_the_domain() {
        for status in application::ApplicationStatus::ALL {
            let graphql = ApplicationStatus::from(status);
            assert_eq!(application::ApplicationStatus::from(graphql), status);
        }
    }

    #[test]
    fn api_token_scope_round_trips_through_the_domain() {
        for scope in api_token::ApiTokenScope::ALL {
            let graphql = ApiTokenScope::from(scope);
            assert_eq!(api_token::ApiTokenScope::from(graphql), scope);
        }
    }
}
