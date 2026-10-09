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
  questionCount
  createdAt
  updatedAt
`;

const INTERVIEW_QUESTION_FIELDS = `
  id
  interviewRoundId
  question
  answer
  position
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

export const INTERVIEW_QUESTIONS_QUERY = `
  query InterviewQuestions($interviewRoundId: ID!) {
    interviewQuestions(interviewRoundId: $interviewRoundId) {
      ${INTERVIEW_QUESTION_FIELDS}
    }
  }
`;

export const CREATE_INTERVIEW_QUESTION_MUTATION = `
  mutation CreateInterviewQuestion($input: CreateInterviewQuestionInput!) {
    createInterviewQuestion(input: $input) {
      ${INTERVIEW_QUESTION_FIELDS}
    }
  }
`;

export const UPDATE_INTERVIEW_QUESTION_MUTATION = `
  mutation UpdateInterviewQuestion($id: ID!, $input: UpdateInterviewQuestionInput!) {
    updateInterviewQuestion(id: $id, input: $input) {
      ${INTERVIEW_QUESTION_FIELDS}
    }
  }
`;

export const DELETE_INTERVIEW_QUESTION_MUTATION = `
  mutation DeleteInterviewQuestion($id: ID!) {
    deleteInterviewQuestion(id: $id)
  }
`;

export const REORDER_INTERVIEW_QUESTIONS_MUTATION = `
  mutation ReorderInterviewQuestions($interviewRoundId: ID!, $orderedIds: [ID!]!) {
    reorderInterviewQuestions(interviewRoundId: $interviewRoundId, orderedIds: $orderedIds) {
      ${INTERVIEW_QUESTION_FIELDS}
    }
  }
`;
