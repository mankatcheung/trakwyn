use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ActivityEventType {
    StatusChanged,
    NoteAdded,
    NoteDeleted,
    DocumentUploaded,
    DocumentDeleted,
    InterviewAdded,
    FieldUpdated,
}

impl ActivityEventType {
    pub const ALL: [Self; 7] = [
        Self::StatusChanged,
        Self::NoteAdded,
        Self::NoteDeleted,
        Self::DocumentUploaded,
        Self::DocumentDeleted,
        Self::InterviewAdded,
        Self::FieldUpdated,
    ];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::StatusChanged => "status_changed",
            Self::NoteAdded => "note_added",
            Self::NoteDeleted => "note_deleted",
            Self::DocumentUploaded => "document_uploaded",
            Self::DocumentDeleted => "document_deleted",
            Self::InterviewAdded => "interview_added",
            Self::FieldUpdated => "field_updated",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|event| event.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActivityLog {
    pub id: String,
    pub application_id: String,
    pub actor_id: String,
    pub event_type: ActivityEventType,
    /// JSON, as written by the use case that appended the entry.
    pub payload: String,
    pub created_at: DateTime<Utc>,
}
