import { describe, it, expect, vi } from 'vitest';
import { ClearAiOutputRatingUseCase } from '#src/use-cases/aiFeedback/ClearAiOutputRatingUseCase.js';
import { GetAiOutputRatingsUseCase } from '#src/use-cases/aiFeedback/GetAiOutputRatingsUseCase.js';
import {
  makeAiFeedback,
  makeAiFeedbackObserver,
  makeAiFeedbackRepository,
  makeAiGeneration,
} from '#src/__tests__/helpers/mocks/aiFeedback.js';

describe('ClearAiOutputRatingUseCase', () => {
  const input = { userId: 'user-1', targetKind: 'chat_message', targetId: 'msg-1' } as const;
  const run = (
    aiFeedbackRepository = makeAiFeedbackRepository(),
    aiFeedbackObserver = makeAiFeedbackObserver(),
  ) => new ClearAiOutputRatingUseCase({ aiFeedbackRepository, aiFeedbackObserver }).execute(input);

  it("clears only the caller's own rating of the target", async () => {
    const aiFeedbackRepository = makeAiFeedbackRepository();

    await run(aiFeedbackRepository);

    expect(aiFeedbackRepository.clear).toHaveBeenCalledWith('user-1', 'chat_message', 'msg-1');
  });

  it('tells the observer which rating was taken back, with its trace (JEF-569)', async () => {
    const removed = makeAiFeedback({
      rating: 'down',
      reason: 'not_useful',
      generation: makeAiGeneration({ traceId: 'trace-1' }),
    });
    const aiFeedbackObserver = makeAiFeedbackObserver();

    await run(
      makeAiFeedbackRepository({ clear: vi.fn().mockResolvedValue(removed) }),
      aiFeedbackObserver,
    );

    expect(aiFeedbackObserver.cleared).toHaveBeenCalledWith({
      userId: 'user-1',
      feature: 'chat',
      rating: 'down',
      reason: 'not_useful',
      generation: removed.generation,
    });
  });

  it('still tells the observer for a rating from before the snapshot, with no generation', async () => {
    const aiFeedbackObserver = makeAiFeedbackObserver();

    await run(
      makeAiFeedbackRepository({
        clear: vi.fn().mockResolvedValue(makeAiFeedback({ generation: null })),
      }),
      aiFeedbackObserver,
    );

    expect(aiFeedbackObserver.cleared).toHaveBeenCalledWith(
      expect.objectContaining({ generation: null }),
    );
  });

  it('sends nothing when there was no rating to clear', async () => {
    const aiFeedbackObserver = makeAiFeedbackObserver();

    await run(makeAiFeedbackRepository(), aiFeedbackObserver);

    expect(aiFeedbackObserver.cleared).not.toHaveBeenCalled();
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
