// Hand-written to match apps/web's -postingRequirementsQueries.ts field-for-field —
// codegen is still deferred for apps/mobile (see JEF-261/262).

const POSTING_REQUIREMENTS_FIELDS = `
  id
  applicationId
  mustHave
  niceToHave
  keywords
  seniority
  generatedAt
  isStale
`;

export const POSTING_REQUIREMENTS_QUERY = `
  query PostingRequirements($applicationId: ID!) {
    postingRequirements(applicationId: $applicationId) { ${POSTING_REQUIREMENTS_FIELDS} }
  }
`;

export const EXTRACT_POSTING_REQUIREMENTS_MUTATION = `
  mutation ExtractPostingRequirements($applicationId: ID!) {
    extractPostingRequirements(applicationId: $applicationId) { ${POSTING_REQUIREMENTS_FIELDS} }
  }
`;
