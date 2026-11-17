export const DRAFT_QUERY = `
  query DocumentDraft($id: ID!) {
    documentDraft(id: $id) {
      id
      applicationId
      type
      title
      contentJson
      plainText
      sourceDocumentId
      aiInstructions
      aiGenerated
      myRating {
        rating
        reason
      }
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_CONTENT_MUTATION = `
  mutation UpdateDocumentDraftContent($input: UpdateDocumentDraftContentInput!) {
    updateDocumentDraftContent(input: $input) {
      id
      updatedAt
    }
  }
`;

export const EXPORT_PDF_MUTATION = `
  mutation ExportDocumentDraftToPdf($draftId: ID!) {
    exportDocumentDraftToPdf(draftId: $draftId) {
      id
      name
      url
    }
  }
`;

export const RENAME_DRAFT_MUTATION = `
  mutation RenameDocumentDraft($draftId: ID!, $title: String!) {
    renameDocumentDraft(draftId: $draftId, title: $title) {
      id
      title
    }
  }
`;

export const DELETE_DRAFT_MUTATION = `
  mutation DeleteDocumentDraft($id: ID!) {
    deleteDocumentDraft(id: $id)
  }
`;
