use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DocumentDraftType {
    CoverLetter,
    Resume,
}

impl DocumentDraftType {
    pub const ALL: [Self; 2] = [Self::CoverLetter, Self::Resume];

    /// The value stored in `DocumentDraft.type` and sent over GraphQL.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::CoverLetter => "cover_letter",
            Self::Resume => "resume",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|draft_type| draft_type.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentDraft {
    pub id: String,
    pub application_id: String,
    pub draft_type: DocumentDraftType,
    pub title: String,
    pub content_json: String,
    pub plain_text: String,
    pub source_document_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn type_round_trips_through_its_stored_value() {
        for draft_type in DocumentDraftType::ALL {
            assert_eq!(DocumentDraftType::parse(draft_type.as_str()), Some(draft_type));
        }
    }

    #[test]
    fn an_unknown_type_does_not_parse() {
        assert_eq!(DocumentDraftType::parse("portfolio"), None);
    }
}
