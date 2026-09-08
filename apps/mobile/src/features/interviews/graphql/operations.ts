// Hand-written to match apps/web's InterviewsTab.tsx field-for-field. See
// ../../applications/graphql/operations.ts for why this stays hand-typed.

const INTERVIEW_ROUND_FIELDS = `
  id
  applicationId
  type
  scheduledAt
  completedAt
  interviewerName
  notes
  outcome
  createdAt
  updatedAt
`;

export const INTERVIEW_ROUNDS_QUERY = `
  query InterviewRounds($applicationId: ID!) {
    interviewRounds(applicationId: $applicationId) {
      ${INTERVIEW_ROUND_FIELDS}
    }
  }
`;

export const CREATE_INTERVIEW_ROUND_MUTATION = `
  mutation CreateInterviewRound($input: CreateInterviewRoundInput!) {
    createInterviewRound(input: $input) {
      ${INTERVIEW_ROUND_FIELDS}
    }
  }
`;

export const UPDATE_INTERVIEW_ROUND_MUTATION = `
  mutation UpdateInterviewRound($id: ID!, $input: UpdateInterviewRoundInput!) {
    updateInterviewRound(id: $id, input: $input) {
      ${INTERVIEW_ROUND_FIELDS}
    }
  }
`;

export const DELETE_INTERVIEW_ROUND_MUTATION = `
  mutation DeleteInterviewRound($id: ID!) {
    deleteInterviewRound(id: $id)
  }
`;
