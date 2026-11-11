import { describe, it, expect, vi } from 'vitest';
import { ClearAiOutputRatingUseCase } from '#src/use-cases/aiFeedback/ClearAiOutputRatingUseCase.js';
import { GetAiOutputRatingsUseCase } from '#src/use-cases/aiFeedback/GetAiOutputRatingsUseCase.js';
import {
  makeAiFeedback,
  makeAiFeedbackRepository,
} from '#src/__tests__/helpers/mocks/aiFeedback.js';

describe('ClearAiOutputRatingUseCase', () => {
  it("clears only the caller's own rating of the target", async () => {
    const aiFeedbackRepository = makeAiFeedbackRepository();

    await new ClearAiOutputRatingUseCase({ aiFeedbackRepository }).execute({
      userId: 'user-1',
      targetKind: 'chat_message',
      targetId: 'msg-1',
    });

    expect(aiFeedbackRepository.clear).toHaveBeenCalledWith('user-1', 'chat_message', 'msg-1');
  });
});

describe('GetAiOutputRatingsUseCase', () => {
  it("returns the caller's ratings among the targets in one query", async () => {
    const rating = makeAiFeedback({ targetId: 'msg-2', rating: 'down', reason: 'not_useful' });
    const aiFeedbackRepository = makeAiFeedbackRepository({
      findForTargets: vi.fn().mockResolvedValue([rating]),
    });

    const result = await new GetAiOutputRatingsUseCase({ aiFeedbackRepository }).execute({
      userId: 'user-1',
      targetKind: 'chat_message',
      targetIds: ['msg-1', 'msg-2'],
    });

    expect(result).toEqual([rating]);
    expect(aiFeedbackRepository.findForTargets).toHaveBeenCalledTimes(1);
    expect(aiFeedbackRepository.findForTargets).toHaveBeenCalledWith('user-1', 'chat_message', [
      'msg-1',
      'msg-2',
    ]);
  });
});
