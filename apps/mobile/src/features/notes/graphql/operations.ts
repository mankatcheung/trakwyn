// Hand-written to match apps/web/src/features/notes/graphql/noteQueries.ts
// field-for-field — codegen is still deferred for apps/mobile (see JEF-261/262).

const NOTE_FIELDS = `
  id
  applicationId
  content
  createdAt
  updatedAt
`;

export const NOTES_QUERY = `
  query Notes($applicationId: ID!) {
    notes(applicationId: $applicationId) {
      ${NOTE_FIELDS}
    }
  }
`;

export const CREATE_NOTE_MUTATION = `
  mutation CreateNote($applicationId: ID!, $content: String!) {
    createNote(applicationId: $applicationId, content: $content) {
      ${NOTE_FIELDS}
    }
  }
`;

export const UPDATE_NOTE_MUTATION = `
  mutation UpdateNote($id: ID!, $content: String!) {
    updateNote(id: $id, content: $content) {
      ${NOTE_FIELDS}
    }
  }
`;

export const DELETE_NOTE_MUTATION = `
  mutation DeleteNote($id: ID!) {
    deleteNote(id: $id)
  }
`;
