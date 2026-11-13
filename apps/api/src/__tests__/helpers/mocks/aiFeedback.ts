import { vi } from 'vitest';
import type { AiFeedback, AiGeneration } from '#src/domain/aiFeedback/AiFeedback.js';
import type { IAiFeedbackRepository } from '#src/use-cases/ports/IAiFeedbackRepository.js';
import type { IAiFeedbackObserver } from '#src/use-cases/ports/IAiFeedbackObserver.js';

export const makeAiGeneration = (overrides?: Partial<AiGeneration>): AiGeneration => ({
  provider: 'openai',
  model: 'gpt-test',
  promptVersion: 3,
  source: 'byok',
  tier: null,
  traceId: null,
  ...overrides,
});

export const makeAiFeedback = (overrides?: Partial<AiFeedback>): AiFeedback => ({
  id: 'fb-1',
  userId: 'user-1',
  targetKind: 'chat_message',
  targetId: 'msg-1',
  feature: 'chat',
  rating: 'up',
  reason: null,
  generation: makeAiGeneration(),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const makeAiFeedbackRepository = (
  overrides?: Partial<IAiFeedbackRepository>,
): IAiFeedbackRepository => ({
  upsert: vi.fn().mockImplementation(async (data) =>
    makeAiFeedback({
      id: data.id,
      userId: data.userId,
      targetKind: data.targetKind,
      targetId: data.targetId,
      feature: data.feature,
      rating: data.rating,
      reason: data.reason,
      generation: data.generation,
    }),
  ),
  clear: vi.fn().mockResolvedValue(null),
  findForTargets: vi.fn().mockResolvedValue([]),
  ...overrides,
});

export const makeAiFeedbackObserver = (
  overrides?: Partial<IAiFeedbackObserver>,
): IAiFeedbackObserver => ({
  rated: vi.fn(),
  cleared: vi.fn(),
  ...overrides,
});
