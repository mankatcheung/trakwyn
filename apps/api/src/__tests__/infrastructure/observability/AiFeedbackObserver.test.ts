import { describe, it, expect, vi } from 'vitest';
import {
  AiFeedbackObserver,
  AI_FEEDBACK_LOG_EVENT,
} from '#src/infrastructure/observability/AiFeedbackObserver.js';
import { makeFakeMetrics } from '#src/__tests__/helpers/fakeMetrics.js';
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
  it('counts the rating and logs one line with the same bounded fields', () => {
    const metrics = makeFakeMetrics();
    const logger = makeLogger();

    new AiFeedbackObserver({ logger, metrics }).rated(event);

    expect(metrics.aiFeedback).toEqual([event]);
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

    new AiFeedbackObserver({ logger, metrics: makeFakeMetrics() }).rated(event);

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
    const metrics = makeFakeMetrics();
    const logger = makeLogger();

    new AiFeedbackObserver({ logger, metrics }).rated({ ...event, generation: null });

    expect(metrics.aiFeedback).toHaveLength(1);
    expect(logger.info).toHaveBeenCalledWith(
      'AI output rated',
      expect.objectContaining({ model: null, prompt_version: null }),
    );
  });

  it('never throws, so a broken metric cannot undo a rating', () => {
    const metrics = makeFakeMetrics();
    metrics.recordAiFeedback = () => {
      throw new Error('exporter down');
    };

    expect(() =>
      new AiFeedbackObserver({ logger: makeLogger(), metrics }).rated(event),
    ).not.toThrow();
  });
});
