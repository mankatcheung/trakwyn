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
  aiInstructions
`;

export const DOCUMENT_DRAFTS_QUERY = `
  query DocumentDrafts($applicationId: ID!) {
    documentDrafts(applicationId: $applicationId) {
      ${DRAFT_SUMMARY_FIELDS}
      plainText
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

/** Saves nothing: the editor decides what to do with the suggestion (JEF-506). */
export const POLISH_DOCUMENT_DRAFT_MUTATION = `
  mutation PolishDocumentDraft($draftId: ID!, $plainText: String!, $instructions: String) {
    polishDocumentDraft(draftId: $draftId, plainText: $plainText, instructions: $instructions) {
      markdown
    }
  }
`;

/** Saves nothing either: the client saves with `updateDocumentDraftContent`. */
export const GENERATE_INTO_DOCUMENT_DRAFT_MUTATION = `
  mutation GenerateIntoDocumentDraft(
    $draftId: ID!
    $instructions: String
    $resumeDocumentId: ID
    $resumeDraftId: ID
  ) {
    generateIntoDocumentDraft(
      draftId: $draftId
      instructions: $instructions
      resumeDocumentId: $resumeDocumentId
      resumeDraftId: $resumeDraftId
    ) {
      contentJson
      plainText
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

// Draft history (JEF-584 API, JEF-588). Field-for-field with apps/web's
// `-draftHistoryQueries.ts`, plus `contentJson` so the preview keeps its structure.
export const DRAFT_VERSIONS_QUERY = `
  query DocumentDraftVersions($draftId: ID!) {
    documentDraftVersions(draftId: $draftId) {
      id
      source
      characterCount
      createdAt
    }
  }
`;

export const DRAFT_VERSION_QUERY = `
  query DocumentDraftVersion($id: ID!) {
    documentDraftVersion(id: $id) {
      id
      source
      contentJson
      plainText
      createdAt
    }
  }
`;

export const CREATE_DRAFT_VERSION_MUTATION = `
  mutation CreateDocumentDraftVersion($draftId: ID!) {
    createDocumentDraftVersion(draftId: $draftId) {
      id
      source
    }
  }
`;

export const RESTORE_DRAFT_VERSION_MUTATION = `
  mutation RestoreDocumentDraftVersion($versionId: ID!) {
    restoreDocumentDraftVersion(versionId: $versionId) {
      id
      contentJson
      plainText
      updatedAt
    }
  }
`;
