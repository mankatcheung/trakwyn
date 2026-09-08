export const INTERVIEW_ROUND_TYPES = ['phone', 'technical', 'onsite', 'hr', 'other'] as const;
export type InterviewRoundType = (typeof INTERVIEW_ROUND_TYPES)[number];

export const INTERVIEW_ROUND_OUTCOMES = ['pending', 'passed', 'failed', 'cancelled'] as const;
export type InterviewRoundOutcome = (typeof INTERVIEW_ROUND_OUTCOMES)[number];

export interface InterviewRound {
  id: string;
  applicationId: string;
  type: InterviewRoundType;
  scheduledAt: string | null;
  completedAt: string | null;
  interviewerName: string | null;
  notes: string | null;
  outcome: InterviewRoundOutcome;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewRoundFormData {
  type: InterviewRoundType;
  scheduledAt: string | null;
  interviewerName: string | null;
  notes: string | null;
  outcome: InterviewRoundOutcome;
}
