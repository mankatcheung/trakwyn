use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::*;
use crate::domain::activity_log::ActivityEventType;
use crate::domain::note::Note;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{
    application_owned_by, sequential_ids, FakeActivityLogRepository, FakeApplicationRepository,
    FakeNoteRepository,
};

const OWNER: &str = "user-owner";
const STRANGER: &str = "user-stranger";
const APPLICATION: &str = "app-1";

struct Fixture {
    applications: Arc<FakeApplicationRepository>,
    notes: Arc<FakeNoteRepository>,
    activity: Arc<FakeActivityLogRepository>,
}

impl Fixture {
    fn new(notes: Vec<Note>) -> Self {
        Self {
            applications: Arc::new(FakeApplicationRepository::with(vec![application_owned_by(
                APPLICATION,
                OWNER,
            )])),
            notes: Arc::new(FakeNoteRepository::with(notes)),
            activity: Arc::default(),
        }
    }

    fn create(&self) -> CreateNoteUseCase {
        CreateNoteUseCase {
            application_repository: self.applications.clone(),
            note_repository: self.notes.clone(),
            activity_log_repository: self.activity.clone(),
            generate_id: sequential_ids("id"),
        }
    }

    fn get(&self) -> GetNotesUseCase {
        GetNotesUseCase {
            application_repository: self.applications.clone(),
            note_repository: self.notes.clone(),
        }
    }

    fn update(&self) -> UpdateNoteUseCase {
        UpdateNoteUseCase {
            application_repository: self.applications.clone(),
            note_repository: self.notes.clone(),
        }
    }

    fn delete(&self) -> DeleteNoteUseCase {
        DeleteNoteUseCase {
            application_repository: self.applications.clone(),
            note_repository: self.notes.clone(),
            activity_log_repository: self.activity.clone(),
            generate_id: sequential_ids("id"),
        }
    }
}

fn note(id: &str, application_id: &str, created_at_s: i64) -> Note {
    let created_at = DateTime::<Utc>::from_timestamp(created_at_s, 0).unwrap();
    Note {
        id: id.to_string(),
        application_id: application_id.to_string(),
        content: format!("content of {id}"),
        created_at,
        updated_at: created_at,
    }
}

fn create_input(user_id: &str, application_id: &str) -> CreateNoteInput {
    CreateNoteInput {
        user_id: user_id.to_string(),
        application_id: application_id.to_string(),
        content: "Called the recruiter".to_string(),
    }
}

mod create {
    use super::*;

    #[tokio::test]
    async fn stores_the_note_and_logs_the_activity() {
        let fixture = Fixture::new(vec![]);

        let created = fixture.create().execute(create_input(OWNER, APPLICATION)).await.unwrap();

        assert_eq!(created.id, "id-1");
        assert_eq!(created.content, "Called the recruiter");
        assert_eq!(fixture.notes.all(), vec![created]);

        let entries = fixture.activity.entries();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, "id-2");
        assert_eq!(entries[0].event_type, ActivityEventType::NoteAdded);
        assert_eq!(entries[0].actor_id, OWNER);
        assert_eq!(entries[0].payload, r#"{"noteId":"id-1"}"#);
    }

    #[tokio::test]
    async fn fails_when_the_application_does_not_exist() {
        let fixture = Fixture::new(vec![]);

        let err = fixture.create().execute(create_input(OWNER, "missing")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Application not found");
        assert!(fixture.notes.all().is_empty());
    }

    #[tokio::test]
    async fn refuses_someone_elses_application() {
        let fixture = Fixture::new(vec![]);

        let err = fixture.create().execute(create_input(STRANGER, APPLICATION)).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert!(fixture.notes.all().is_empty());
        assert!(fixture.activity.entries().is_empty());
    }
}

mod get {
    use super::*;

    fn input(user_id: &str, application_id: &str) -> GetNotesInput {
        GetNotesInput { user_id: user_id.to_string(), application_id: application_id.to_string() }
    }

    #[tokio::test]
    async fn returns_the_applications_notes_newest_first() {
        let fixture = Fixture::new(vec![
            note("old", APPLICATION, 100),
            note("new", APPLICATION, 200),
            note("other", "app-2", 300),
        ]);

        let notes = fixture.get().execute(input(OWNER, APPLICATION)).await.unwrap();

        let ids: Vec<&str> = notes.iter().map(|note| note.id.as_str()).collect();
        assert_eq!(ids, vec!["new", "old"]);
    }

    #[tokio::test]
    async fn fails_when_the_application_does_not_exist() {
        let err = Fixture::new(vec![]).get().execute(input(OWNER, "missing")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
    }

    #[tokio::test]
    async fn refuses_someone_elses_application() {
        let fixture = Fixture::new(vec![note("n", APPLICATION, 100)]);
        let err = fixture.get().execute(input(STRANGER, APPLICATION)).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Forbidden);
    }
}

mod update {
    use super::*;

    fn input(user_id: &str, note_id: &str) -> UpdateNoteInput {
        UpdateNoteInput {
            user_id: user_id.to_string(),
            note_id: note_id.to_string(),
            content: "Rewritten".to_string(),
        }
    }

    #[tokio::test]
    async fn rewrites_the_content() {
        let fixture = Fixture::new(vec![note("n", APPLICATION, 100)]);

        let updated = fixture.update().execute(input(OWNER, "n")).await.unwrap();

        assert_eq!(updated.content, "Rewritten");
        assert_eq!(fixture.notes.all()[0].content, "Rewritten");
    }

    #[tokio::test]
    async fn fails_when_the_note_does_not_exist() {
        let err = Fixture::new(vec![]).update().execute(input(OWNER, "missing")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Note not found");
    }

    #[tokio::test]
    async fn refuses_a_note_on_someone_elses_application() {
        let fixture = Fixture::new(vec![note("n", APPLICATION, 100)]);

        let err = fixture.update().execute(input(STRANGER, "n")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(fixture.notes.all()[0].content, "content of n");
    }

    #[tokio::test]
    async fn refuses_a_note_whose_application_is_gone() {
        let fixture = Fixture::new(vec![note("orphan", "app-trashed", 100)]);
        let err = fixture.update().execute(input(OWNER, "orphan")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Forbidden);
    }
}

mod delete {
    use super::*;

    fn input(user_id: &str, note_id: &str) -> DeleteNoteInput {
        DeleteNoteInput { user_id: user_id.to_string(), note_id: note_id.to_string() }
    }

    #[tokio::test]
    async fn removes_the_note_and_logs_the_activity() {
        let fixture = Fixture::new(vec![note("n", APPLICATION, 100)]);

        fixture.delete().execute(input(OWNER, "n")).await.unwrap();

        assert!(fixture.notes.all().is_empty());
        let entries = fixture.activity.entries();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].event_type, ActivityEventType::NoteDeleted);
        assert_eq!(entries[0].application_id, APPLICATION);
        assert_eq!(entries[0].payload, r#"{"noteId":"n"}"#);
    }

    #[tokio::test]
    async fn fails_when_the_note_does_not_exist() {
        let err = Fixture::new(vec![]).delete().execute(input(OWNER, "missing")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
    }

    #[tokio::test]
    async fn refuses_a_note_on_someone_elses_application() {
        let fixture = Fixture::new(vec![note("n", APPLICATION, 100)]);

        let err = fixture.delete().execute(input(STRANGER, "n")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(fixture.notes.all().len(), 1);
        assert!(fixture.activity.entries().is_empty());
    }
}
