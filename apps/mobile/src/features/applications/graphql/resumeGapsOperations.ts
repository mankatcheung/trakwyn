// Hand-written to match apps/web's -resumeGapsQueries.ts field-for-field —
// codegen is still deferred for apps/mobile (see JEF-261/262).

const RESUME_GAPS_FIELDS = `
  requirementsRead
  requirementGaps
  rolesWithoutMetrics { workExperienceId company title description }
`;

export const RESUME_GAPS_QUERY = `
  query ResumeGaps($applicationId: ID!) {
    resumeGaps(applicationId: $applicationId) { ${RESUME_GAPS_FIELDS} }
  }
`;

export const DISMISS_RESUME_GAP_MUTATION = `
  mutation DismissResumeGap($applicationId: ID!, $key: String!) {
    dismissResumeGap(applicationId: $applicationId, key: $key) { ${RESUME_GAPS_FIELDS} }
  }
`;
