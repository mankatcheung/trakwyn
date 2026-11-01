export interface GenerateMockQuestionsInput {
  userId: string;
  roundId: string;
  /** What the user wants the questions to focus on. */
  prompt?: string;
  /** How many to ask for; clamped to `MOCK_QUESTION_GENERATION.MAX_COUNT`. */
  count?: number; /** Send the user's profile to the model (JEF-394). Off by default: it goes to their AI provider. */
  useProfile?: boolean;
  /** One of the user's own documents whose text is sent to the model (JEF-394). */
  documentId?: string;
}

export interface GenerateMockQuestionsOutput {
  /** Suggestions only: nothing is saved until the user keeps some. */
  suggestions: string[];
  usedJobDescription: boolean;
  usedBriefing: boolean;
  /** What the model had of the candidate, so the UI can say when it had nothing. */
  usedProfile: boolean;
  usedDocument: boolean;
}

export interface IGenerateMockQuestionsUseCase {
  execute(input: GenerateMockQuestionsInput): Promise<GenerateMockQuestionsOutput>;
}
