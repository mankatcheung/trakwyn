export interface GenerateMockQuestionsInput {
  userId: string;
  roundId: string;
  /** What the user wants the questions to focus on. */
  prompt?: string;
  /** How many to ask for; clamped to `MOCK_QUESTION_GENERATION.MAX_COUNT`. */
  count?: number;
}

export interface GenerateMockQuestionsOutput {
  /** Suggestions only: nothing is saved until the user keeps some. */
  suggestions: string[];
  usedJobDescription: boolean;
  usedBriefing: boolean;
}

export interface IGenerateMockQuestionsUseCase {
  execute(input: GenerateMockQuestionsInput): Promise<GenerateMockQuestionsOutput>;
}
