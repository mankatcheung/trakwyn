/**
 * Test doubles for the interviews domain.
 *
 * One of the per-domain modules split out of the former 816-line
 * `helpers/mocks.ts` (JEF-254), which held all 68 factories together and was
 * imported by 157 test files.
 */

import { vi } from 'vitest';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IInterviewQuestionRepository } from '#src/use-cases/ports/IInterviewQuestionRepository.js';
import type { InterviewRound } from '#src/domain/interviewRound/InterviewRound.js';
import type { InterviewQuestion } from '#src/domain/interviewRound/InterviewQuestion.js';

export const makeInterviewRoundRepository = (
  overrides?: Partial<IInterviewRoundRepository>,
): IInterviewRoundRepository => ({
  findAllByApplicationId: vi.fn(),
  countByApplicationId: vi.fn().mockResolvedValue(0),
  findAllByUserId: vi.fn().mockResolvedValue([]),
  findUpcomingWithinWindow: vi.fn().mockResolvedValue([]),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updatePushNotificationSentAt: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn(),
  ...overrides,
});

export const makeInterviewRound = (overrides?: Partial<InterviewRound>): InterviewRound => ({
  id: 'round-1',
  applicationId: 'app-1',
  type: 'phone',
  scheduledAt: null,
  completedAt: null,
  interviewerName: null,
  notes: null,
  outcome: 'pending',
  questionCount: 0,
  pushNotificationSentAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const makeInterviewQuestionRepository = (
  overrides?: Partial<IInterviewQuestionRepository>,
): IInterviewQuestionRepository => ({
  findAllByRoundId: vi.fn().mockResolvedValue([]),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn().mockResolvedValue(undefined),
  reorder: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

export const makeInterviewQuestion = (
  overrides?: Partial<InterviewQuestion>,
): InterviewQuestion => ({
  id: 'question-1',
  interviewRoundId: 'round-1',
  question: 'Tell me about yourself',
  answer: null,
  position: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});
