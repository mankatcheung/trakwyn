import { describe, it, expect, vi } from 'vitest';
import {
  AiFeedbackObserver,
  AI_FEEDBACK_LOG_EVENT,
} from '#src/infrastructure/observability/AiFeedbackObserver.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeAiGeneration } from '#src/__tests__/helpers/mocks/aiFeedback.js';

const event = {
  userId: 'user-1',
  feature: 'chat',
  rating: 'down',
  reason: 'wrong_or_made_up',
  generation: makeAiGeneration({
    model: 'gem-1',
    promptVersion: 4,
    source: 'platform',
    tier: 'lite',
    traceId: 'trace-1',
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

  describe('PostHog (JEF-569)', () => {
    const makeAnalytics = () => ({
      generation: vi.fn(),
      span: vi.fn(),
      feedback: vi.fn(),
      feedbackCleared: vi.fn(),
      shutdown: vi.fn(),
    });
    const build = (aiAnalytics: ReturnType<typeof makeAnalytics>) =>
      new AiFeedbackObserver({ logger: makeLogger(), aiAnalytics });

    it('sends a rating on the generation trace, with bounded fields only', () => {
      const aiAnalytics = makeAnalytics();

      build(aiAnalytics).rated(event);

      expect(aiAnalytics.feedback).toHaveBeenCalledWith({
        userId: 'user-1',
        traceId: 'trace-1',
        feature: 'chat',
        rating: 'down',
        reason: 'wrong_or_made_up',
        provider: 'openai',
        model: 'gem-1',
        promptVersion: '4',
        source: 'platform',
        tier: 'lite',
      });
      expect(Object.keys(aiAnalytics.feedback.mock.calls[0][0]).sort()).toEqual(
        [
          'feature',
          'model',
          'promptVersion',
          'provider',
          'rating',
          'reason',
          'source',
          'tier',
          'traceId',
          'userId',
        ].sort(),
      );
    });

    it('still sends a rating on output from before the snapshot, with no trace id', () => {
      const aiAnalytics = makeAnalytics();

      build(aiAnalytics).rated({ ...event, generation: null });

      expect(aiAnalytics.feedback).toHaveBeenCalledWith(
        expect.objectContaining({ traceId: null, model: null, promptVersion: null }),
      );
    });

    it('sends a cleared rating as feedbackCleared', () => {
      const aiAnalytics = makeAnalytics();

      build(aiAnalytics).cleared(event);

      expect(aiAnalytics.feedbackCleared).toHaveBeenCalledWith(
        expect.objectContaining({ traceId: 'trace-1', rating: 'down' }),
      );
      expect(aiAnalytics.feedback).not.toHaveBeenCalled();
    });

    it('never throws when PostHog fails, and the log line is still written', () => {
      const aiAnalytics = makeAnalytics();
      aiAnalytics.feedback.mockImplementation(() => {
        throw new Error('posthog down');
      });
      aiAnalytics.feedbackCleared.mockImplementation(() => {
        throw new Error('posthog down');
      });
      const logger = makeLogger();
      const observer = new AiFeedbackObserver({ logger, aiAnalytics });

      expect(() => observer.rated(event)).not.toThrow();
      expect(() => observer.cleared(event)).not.toThrow();
      expect(logger.info).toHaveBeenCalledTimes(1);
    });
  });
});
