// Hand-written to match apps/web's CompanyBriefingTab.tsx GraphQL operations
// field-for-field — codegen is still deferred for apps/mobile (see JEF-261/262).

const BRIEFING_FIELDS = `
  id
  applicationId
  content
  generatedAt
`;

export const COMPANY_BRIEFING_QUERY = `
  query CompanyBriefing($applicationId: ID!) {
    companyBriefing(applicationId: $applicationId) {
      ${BRIEFING_FIELDS}
    }
  }
`;

export const GENERATE_COMPANY_BRIEFING_MUTATION = `
  mutation GenerateCompanyBriefing($applicationId: ID!) {
    generateCompanyBriefing(applicationId: $applicationId) {
      ${BRIEFING_FIELDS}
    }
  }
`;
