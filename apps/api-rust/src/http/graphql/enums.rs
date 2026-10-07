//! GraphQL enums more than one resolver module uses. One enum per block, each
//! mirroring a domain enum: the contract spells the values as they are stored.

// --- InterviewRoundType ----------------------------------------------------

#[derive(async_graphql::Enum, Clone, Copy, PartialEq, Eq)]
#[graphql(name = "InterviewRoundType", rename_items = "lowercase")]
pub enum InterviewRoundTypeEnum {
    Phone,
    Technical,
    Onsite,
    Hr,
    Other,
}

impl From<crate::domain::interview_round::InterviewRoundType> for InterviewRoundTypeEnum {
    fn from(value: crate::domain::interview_round::InterviewRoundType) -> Self {
        use crate::domain::interview_round::InterviewRoundType as Domain;
        match value {
            Domain::Phone => Self::Phone,
            Domain::Technical => Self::Technical,
            Domain::Onsite => Self::Onsite,
            Domain::Hr => Self::Hr,
            Domain::Other => Self::Other,
        }
    }
}

impl From<InterviewRoundTypeEnum> for crate::domain::interview_round::InterviewRoundType {
    fn from(value: InterviewRoundTypeEnum) -> Self {
        match value {
            InterviewRoundTypeEnum::Phone => Self::Phone,
            InterviewRoundTypeEnum::Technical => Self::Technical,
            InterviewRoundTypeEnum::Onsite => Self::Onsite,
            InterviewRoundTypeEnum::Hr => Self::Hr,
            InterviewRoundTypeEnum::Other => Self::Other,
        }
    }
}

// --- InterviewRoundOutcome -------------------------------------------------

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
