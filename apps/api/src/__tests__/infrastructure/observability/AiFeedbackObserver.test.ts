import { describe, it, expect, vi } from 'vitest';
import {
  AiFeedbackObserver,
  AI_FEEDBACK_LOG_EVENT,
} from '#src/infrastructure/observability/AiFeedbackObserver.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeAiGeneration } from '#src/__tests__/helpers/mocks/aiFeedback.js';

const event = {
  feature: 'chat',
  rating: 'down',
  reason: 'wrong_or_made_up',
  generation: makeAiGeneration({
    model: 'gem-1',
    promptVersion: 4,
    source: 'platform',
    tier: 'lite',
  }),
};

describe('AiFeedbackObserver (JEF-547)', () => {
  it('logs one line with the bounded fields', () => {
    const logger = makeLogger();

    new AiFeedbackObserver({ logger }).rated(event);

    expect(logger.info).toHaveBeenCalledWith('AI output rated', {
      event: AI_FEEDBACK_LOG_EVENT,
      feature: 'chat',
      rating: 'down',
      reason: 'wrong_or_made_up',
      provider: 'openai',
      model: 'gem-1',
      prompt_version: 4,
      source: 'platform',
      tier: 'lite',
    });
  });

  it('logs nothing about the output itself', () => {
    const logger = makeLogger();

    new AiFeedbackObserver({ logger }).rated(event);

    const fields = Object.keys(vi.mocked(logger.info).mock.calls[0][1] ?? {});
    expect(fields).toEqual([
      'event',
      'feature',
      'rating',
      'reason',
      'provider',
      'model',
      'prompt_version',
      'source',
      'tier',
    ]);
  });

  it('records a rating on an output from before the snapshot', () => {
    const logger = makeLogger();

    new AiFeedbackObserver({ logger }).rated({ ...event, generation: null });

    expect(logger.info).toHaveBeenCalledWith(
      'AI output rated',
      expect.objectContaining({ model: null, prompt_version: null }),
    );
  });

  it('never throws, so a broken logger cannot undo a rating', () => {
    const logger = makeLogger();
    vi.mocked(logger.info).mockImplementation(() => {
      throw new Error('logger down');
    });

    expect(() => new AiFeedbackObserver({ logger }).rated(event)).not.toThrow();
  });
});
