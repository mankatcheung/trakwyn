import type { MockInterviewQuestion } from '#src/domain/interviewRound/MockInterviewQuestion.js';

export interface GenerateTalkingPointsInput {
  userId: string;
  questionId: string;
  /** Defaults to true: talking points are meaningless without the candidate's background. */
  useProfile?: boolean;
  /** One of the user's own documents, used instead of or alongside the profile. */
  documentId?: string;
  /**
   * Save the points on the question (default true). Chat and MCP pass false: like the
   * other generators they hand back a draft, and a read-scoped MCP token must not write.
   */
  save?: boolean;
}

export interface GenerateTalkingPointsOutput {
  /** The question with its talking points saved, or unchanged when not saved or `nothingRelevant`. */
  question: MockInterviewQuestion;
  /** The generated bullets, one `- point (source)` per line; null when `nothingRelevant`. */
  talkingPoints: string | null;
  /**
   * True when the background held nothing relevant to the question. Nothing is
   * saved then, and the model is not called at all when there was no background.
   */
  nothingRelevant: boolean;
  usedProfile: boolean;
  usedDocument: boolean;
}

export interface IGenerateTalkingPointsUseCase {
  execute(input: GenerateTalkingPointsInput): Promise<GenerateTalkingPointsOutput>;
}
