export interface GenerateMockAnswerInput {
  userId: string;
  questionId: string;
  /** Optional steer, e.g. "keep it under a minute". */
  prompt?: string;
}

export interface GenerateMockAnswerOutput {
  /** A draft only: it is saved, labelled as AI generated, when the user keeps it. */
  answer: string;
  usedJobDescription: boolean;
  usedBriefing: boolean;
}

export interface IGenerateMockAnswerUseCase {
  execute(input: GenerateMockAnswerInput): Promise<GenerateMockAnswerOutput>;
}
