export interface GenerateMockAnswerInput {
  userId: string;
  questionId: string;
  /** Optional steer, e.g. "keep it under a minute". */
  prompt?: string; /** Send the user's profile to the model (JEF-394). Off by default: it goes to their AI provider. */
  useProfile?: boolean;
  /** One of the user's own documents whose text is sent to the model (JEF-394). */
  documentId?: string;
}

export interface GenerateMockAnswerOutput {
  /** A draft only: it is saved, labelled as AI generated, when the user keeps it. */
  answer: string;
  usedJobDescription: boolean;
  usedBriefing: boolean;
  /** What the model had of the candidate, so the UI can say when it had nothing. */
  usedProfile: boolean;
  usedDocument: boolean;
}

export interface IGenerateMockAnswerUseCase {
  execute(input: GenerateMockAnswerInput): Promise<GenerateMockAnswerOutput>;
}
