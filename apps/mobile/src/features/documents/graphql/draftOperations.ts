// Hand-written to match apps/web's DocumentDraftEditor/DocumentsTab GraphQL
// operations field-for-field — codegen is still deferred for apps/mobile
// (see JEF-261/262).

const DRAFT_SUMMARY_FIELDS = `
  id
  applicationId
  type
  title
  createdAt
  updatedAt
`;

const DRAFT_FIELDS = `
  ${DRAFT_SUMMARY_FIELDS}
  contentJson
  plainText
  sourceDocumentId
`;

export const DOCUMENT_DRAFTS_QUERY = `
  query DocumentDrafts($applicationId: ID!) {
    documentDrafts(applicationId: $applicationId) {
      ${DRAFT_SUMMARY_FIELDS}
    }
  }
`;

export const DOCUMENT_DRAFT_QUERY = `
  query DocumentDraft($id: ID!) {
    documentDraft(id: $id) {
      ${DRAFT_FIELDS}
    }
  }
`;

export const CREATE_DOCUMENT_DRAFT_MUTATION = `
  mutation CreateDocumentDraft($input: CreateDocumentDraftInput!) {
    createDocumentDraft(input: $input) {
      ${DRAFT_FIELDS}
    }
  }
`;

export const UPDATE_DOCUMENT_DRAFT_CONTENT_MUTATION = `
  mutation UpdateDocumentDraftContent($input: UpdateDocumentDraftContentInput!) {
    updateDocumentDraftContent(input: $input) {
      id
      updatedAt
    }
  }
`;

export const RENAME_DOCUMENT_DRAFT_MUTATION = `
  mutation RenameDocumentDraft($draftId: ID!, $title: String!) {
    renameDocumentDraft(draftId: $draftId, title: $title) {
      id
      title
    }
  }
`;

export const DELETE_DOCUMENT_DRAFT_MUTATION = `
  mutation DeleteDocumentDraft($id: ID!) {
    deleteDocumentDraft(id: $id)
  }
`;

export const EXPORT_DOCUMENT_DRAFT_TO_PDF_MUTATION = `
  mutation ExportDocumentDraftToPdf($draftId: ID!) {
    exportDocumentDraftToPdf(draftId: $draftId) {
      id
      name
      url
    }
  }
`;

export const GENERATE_RESUME_MUTATION = `
  mutation GenerateResume($applicationId: ID!) {
    generateResume(applicationId: $applicationId) {
      id
      applicationId
    }
  }
`;

export const EXTRACT_DOCUMENT_TEXT_MUTATION = `
  mutation ExtractDocumentText($documentId: ID!) {
    extractDocumentText(documentId: $documentId) {
      text
    }
  }
`;
