//! GraphQL enums shared by more than one resolver module. Each slice keeps
//! its enums in its own block.

// ---------------------------------------------------------------------------
// Account management: DigestFrequency
// ---------------------------------------------------------------------------

// How often the digest email is sent. The contract spells the values in
// upper case; the stored values are the domain's lower-case ones.
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

// ---------------------------------------------------------------------------
// End of account management
// ---------------------------------------------------------------------------
