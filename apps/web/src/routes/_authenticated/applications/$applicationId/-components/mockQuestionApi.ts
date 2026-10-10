/** Documents and shapes for an interview round's practice (mock) questions (JEF-393). */

export const MOCK_QUESTION_FIELDS =
  'id interviewRoundId question answer answerSource position createdAt updatedAt';

export const MOCK_QUESTIONS_QUERY = `
  query MockInterviewQuestions($interviewRoundId: ID!) {
    mockInterviewQuestions(interviewRoundId: $interviewRoundId) { ${MOCK_QUESTION_FIELDS} }
  }
`;
export const CREATE_MOCK_QUESTION = `
  mutation CreateMockInterviewQuestion($input: CreateMockInterviewQuestionInput!) {
    createMockInterviewQuestion(input: $input) { ${MOCK_QUESTION_FIELDS} }
  }
`;
export const UPDATE_MOCK_QUESTION = `
  mutation UpdateMockInterviewQuestion($id: ID!, $input: UpdateMockInterviewQuestionInput!) {
    updateMockInterviewQuestion(id: $id, input: $input) { ${MOCK_QUESTION_FIELDS} }
  }
`;
export const DELETE_MOCK_QUESTION = `mutation DeleteMockInterviewQuestion($id: ID!) { deleteMockInterviewQuestion(id: $id) }`;
export const REORDER_MOCK_QUESTIONS = `
  mutation ReorderMockInterviewQuestions($interviewRoundId: ID!, $orderedIds: [ID!]!) {
    reorderMockInterviewQuestions(interviewRoundId: $interviewRoundId, orderedIds: $orderedIds) { ${MOCK_QUESTION_FIELDS} }
  }
`;
export const GENERATE_MOCK_QUESTIONS = `
  mutation GenerateMockInterviewQuestions($interviewRoundId: ID!, $prompt: String, $count: Int) {
    generateMockInterviewQuestions(interviewRoundId: $interviewRoundId, prompt: $prompt, count: $count) {
      suggestions usedJobDescription usedBriefing
    }
  }
`;
export const GENERATE_MOCK_ANSWER = `
  mutation GenerateMockInterviewAnswer($mockInterviewQuestionId: ID!, $prompt: String) {
    generateMockInterviewAnswer(mockInterviewQuestionId: $mockInterviewQuestionId, prompt: $prompt) {
      answer usedJobDescription usedBriefing
    }
  }
`;

export type AnswerSource = 'user' | 'ai';

export type MockQuestion = {
  id: string;
  interviewRoundId: string;
  question: string;
  answer: string | null;
  answerSource: AnswerSource;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type MockQuestionsData = { mockInterviewQuestions: MockQuestion[] };

export type GeneratedQuestions = {
  suggestions: string[];
  usedJobDescription: boolean;
  usedBriefing: boolean;
};

export type GeneratedAnswer = {
  answer: string;
  usedJobDescription: boolean;
  usedBriefing: boolean;
};
