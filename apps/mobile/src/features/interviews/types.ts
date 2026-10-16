export const INTERVIEW_ROUND_TYPES = ['phone', 'technical', 'onsite', 'hr', 'other'] as const;
export type InterviewRoundType = (typeof INTERVIEW_ROUND_TYPES)[number];

export const INTERVIEW_ROUND_OUTCOMES = ['pending', 'passed', 'failed', 'cancelled'] as const;
export type InterviewRoundOutcome = (typeof INTERVIEW_ROUND_OUTCOMES)[number];

/**
 * Mirrors `CONTENT_LIMITS.QUESTIONS_PER_ROUND` and `INTERVIEW_QUESTION_LIMITS`
 * in `apps/api/src/use-cases/constants.ts`. The API enforces them; these only
 * size the inputs and decide when to stop offering "Add question".
 */
export const INTERVIEW_QUESTION_LIMITS = {
  QUESTIONS_PER_ROUND: 50,
  QUESTION_MAX_CHARS: 500,
  ANSWER_MAX_CHARS: 4000,
} as const;

/**
 * Mirrors the practice-question limits in `apps/api/src/use-cases/constants.ts`
 * (`CONTENT_LIMITS.MOCK_QUESTIONS_PER_ROUND`, `MOCK_QUESTION_GENERATION` and
 * `AI_PROMPT_INPUT.MOCK_INTERVIEW_USER_PROMPT_MAX_CHARS`). The API enforces them.
 */
export const MOCK_QUESTION_LIMITS = {
  QUESTIONS_PER_ROUND: 30,
  PROMPT_MAX_CHARS: 500,
  GENERATE_COUNT: 5,
} as const;

export interface InterviewRound {
  id: string;
  applicationId: string;
  type: InterviewRoundType;
  scheduledAt: string | null;
  completedAt: string | null;
  interviewerName: string | null;
  notes: string | null;
  outcome: InterviewRoundOutcome;
  questionCount: number;
  mockQuestionCount: number;
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

export interface InterviewQuestion {
  id: string;
  interviewRoundId: string;
  question: string;
  answer: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewQuestionFormData {
  question: string;
  answer: string;
}

/** `ai` marks an answer that began as an AI draft; it stays however the text is edited. */
export type AnswerSource = 'user' | 'ai';

/** A practice question: preparation, kept apart from the questions actually asked. */
export interface MockInterviewQuestion {
  id: string;
  interviewRoundId: string;
  question: string;
  answer: string | null;
  answerSource: AnswerSource;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedMockQuestions {
  suggestions: string[];
  usedJobDescription: boolean;
  usedBriefing: boolean;
}

export interface GeneratedMockAnswer {
  answer: string;
  usedJobDescription: boolean;
  usedBriefing: boolean;
}
