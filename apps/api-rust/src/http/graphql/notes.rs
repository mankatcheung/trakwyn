use async_graphql::{Context, Object, Result, SimpleObject, ID};

use super::support::{container, iso, require_user};
use crate::domain::note::Note;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::notes::{CreateNoteInput, DeleteNoteInput, GetNotesInput, UpdateNoteInput};

#[derive(SimpleObject)]
#[graphql(name = "Note")]
pub struct NoteObject {
    id: Option<ID>,
    application_id: Option<ID>,
    content: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

impl From<Note> for NoteObject {
    fn from(note: Note) -> Self {
        Self {
            id: Some(ID(note.id)),
            application_id: Some(ID(note.application_id)),
            content: Some(note.content),
            created_at: Some(iso(note.created_at)),
            updated_at: Some(iso(note.updated_at)),
        }
    }
}

#[derive(Default)]
pub struct NotesQuery;

#[Object]
impl NotesQuery {
    async fn notes(
        &self,
        ctx: &Context<'_>,
        application_id: ID,
    ) -> Result<Option<Vec<NoteObject>>> {
        let user = require_user(ctx)?;
        let notes = container(ctx)
            .get_notes_use_case()
            .execute(GetNotesInput { user_id: user.sub.clone(), application_id: application_id.0 })
            .await
            .gql()?;
        Ok(Some(notes.into_iter().map(NoteObject::from).collect()))
    }
}

#[derive(Default)]
pub struct NotesMutation;

#[Object]
impl NotesMutation {
    async fn create_note(
        &self,
        ctx: &Context<'_>,
        application_id: ID,
        content: String,
    ) -> Result<Option<NoteObject>> {
        let user = require_user(ctx)?;
        let note = container(ctx)
            .create_note_use_case()
            .execute(CreateNoteInput {
                user_id: user.sub.clone(),
                application_id: application_id.0,
                content,
            })
            .await
            .gql()?;
        Ok(Some(note.into()))
    }

    async fn update_note(
        &self,
        ctx: &Context<'_>,
        id: ID,
        content: String,
    ) -> Result<Option<NoteObject>> {
        let user = require_user(ctx)?;
        let note = container(ctx)
            .update_note_use_case()
            .execute(UpdateNoteInput { user_id: user.sub.clone(), note_id: id.0, content })
            .await
            .gql()?;
        Ok(Some(note.into()))
    }

    async fn delete_note(&self, ctx: &Context<'_>, id: ID) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .delete_note_use_case()
            .execute(DeleteNoteInput { user_id: user.sub.clone(), note_id: id.0 })
            .await
            .gql()?;
        Ok(Some(true))
    }
}
