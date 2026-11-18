import { graphql } from '#/graphql/generated';
/** Documents for an application's notes. */

export const NOTES_QUERY = graphql(`
  query Notes($applicationId: ID!) {
    notes(applicationId: $applicationId) {
      id
      applicationId
      content
      createdAt
      updatedAt
    }
  }
`);
export const CREATE_NOTE = graphql(`
  mutation CreateNote($applicationId: ID!, $content: String!) {
    createNote(applicationId: $applicationId, content: $content) {
      id
      applicationId
      content
      createdAt
      updatedAt
    }
  }
`);
export const UPDATE_NOTE = graphql(`
  mutation UpdateNote($id: ID!, $content: String!) {
    updateNote(id: $id, content: $content) {
      id
      applicationId
      content
      createdAt
      updatedAt
    }
  }
`);
export const DELETE_NOTE = graphql(`
  mutation DeleteNote($id: ID!) {
    deleteNote(id: $id)
  }
`);
