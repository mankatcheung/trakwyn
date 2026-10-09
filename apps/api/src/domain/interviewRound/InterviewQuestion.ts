/** A question asked in an interview round and, optionally, how the user answered it. */
export interface InterviewQuestion {
  id: string;
  interviewRoundId: string;
  question: string;
  answer: string | null;
  /** Zero-based order within the round. */
  position: number;
  createdAt: Date;
  updatedAt: Date;
}
