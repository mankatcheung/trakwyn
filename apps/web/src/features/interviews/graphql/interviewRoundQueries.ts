/** Documents and shapes for an application's interview rounds. */

export const INTERVIEW_ROUNDS_QUERY = `
  query InterviewRounds($applicationId: ID!) {
    interviewRounds(applicationId: $applicationId) {
      id applicationId type scheduledAt completedAt interviewerName notes outcome questionCount mockQuestionCount createdAt updatedAt
    }
  }
`;
export const CREATE_ROUND = `
  mutation CreateInterviewRound($input: CreateInterviewRoundInput!) {
    createInterviewRound(input: $input) {
      id applicationId type scheduledAt completedAt interviewerName notes outcome questionCount mockQuestionCount createdAt updatedAt
    }
  }
`;
export const UPDATE_ROUND = `
  mutation UpdateInterviewRound($id: ID!, $input: UpdateInterviewRoundInput!) {
    updateInterviewRound(id: $id, input: $input) {
      id applicationId type scheduledAt completedAt interviewerName notes outcome questionCount mockQuestionCount createdAt updatedAt
    }
  }
`;
export const DELETE_ROUND = `mutation DeleteInterviewRound($id: ID!) { deleteInterviewRound(id: $id) }`;

export type InterviewRound = {
  id: string;
  applicationId: string;
  type: string;
  scheduledAt?: string | null;
  completedAt?: string | null;
  interviewerName?: string | null;
  notes?: string | null;
  outcome: string;
  questionCount: number;
  mockQuestionCount: number;
  createdAt: string;
  updatedAt: string;
};

export type InterviewRoundsData = { interviewRounds: InterviewRound[] };
