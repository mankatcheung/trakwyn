export type InterviewRoundType = 'phone' | 'technical' | 'onsite' | 'hr' | 'other';
export type InterviewRoundOutcome = 'pending' | 'passed' | 'failed' | 'cancelled';

export interface InterviewRound {
  id: string;
  applicationId: string;
  type: InterviewRoundType;
  scheduledAt: Date | null;
  completedAt: Date | null;
  interviewerName: string | null;
  notes: string | null;
  outcome: InterviewRoundOutcome;
  /** How many InterviewQuestion rows the round has; backs the per-round quota. */
  questionCount: number;
  /** How many MockInterviewQuestion rows the round has; backs the practice-question quota. */
  mockQuestionCount: number;
  pushNotificationSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
