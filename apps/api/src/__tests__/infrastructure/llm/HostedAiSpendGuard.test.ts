import { describe, it, expect, vi } from 'vitest';
import {
  HostedAiSpendGuard,
  dailyBudgetMicros,
} from '#src/infrastructure/llm/HostedAiSpendGuard.js';
import { MemoryAiSpendCounter } from '#src/infrastructure/cache/MemoryAiSpendCounter.js';
import { RedisAiSpendCounter } from '#src/infrastructure/cache/RedisAiSpendCounter.js';
import type { IAiSpendCounter } from '#src/infrastructure/cache/IAiSpendCounter.js';
import { AiTemporarilyUnavailableError } from '#src/use-cases/errors/DomainError.js';
import { HOSTED_AI } from '#src/use-cases/constants.js';
import { makeFakeMetrics } from '#src/__tests__/helpers/fakeMetrics.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';

const failingCounter: IAiSpendCounter = {
  get: vi.fn().mockRejectedValue(new Error('redis down')),
  add: vi.fn().mockRejectedValue(new Error('redis down')),
};

function build(counter: IAiSpendCounter, now = new Date('2026-11-03T10:00:00Z'), budget = 1000) {
  const metrics = makeFakeMetrics();
  const logger = makeLogger();
  const guard = new HostedAiSpendGuard({
    counter,
    logger,
    metrics,
    now: () => now,
    budgetMicros: () => budget,
  });
  return { guard, metrics, logger };
}

describe('HostedAiSpendGuard (JEF-449)', () => {
  it('allows calls under budget', async () => {
    const { guard } = build(new MemoryAiSpendCounter());
    await guard.record(999);
    await expect(guard.assertWithinBudget()).resolves.toBeUndefined();
  });

  it('refuses once the day’s spend reaches the budget, with a warn and a metric', async () => {
    const { guard, metrics, logger } = build(new MemoryAiSpendCounter());
    await guard.record(1000);

    await expect(guard.assertWithinBudget()).rejects.toBeInstanceOf(AiTemporarilyUnavailableError);
    expect(metrics.breakerOpens).toEqual(['over_budget']);
    expect(logger.warn).toHaveBeenCalledWith(
      'hosted_ai.breaker_open',
      undefined,
      expect.objectContaining({ event: 'hosted_ai.breaker_open', reason: 'over_budget' }),
    );
  });

  it('starts a fresh budget on the next UTC date', async () => {
    const counter = new MemoryAiSpendCounter();
    await build(counter, new Date('2026-11-03T23:59:00Z')).guard.record(5000);
    const tomorrow = build(counter, new Date('2026-11-04T00:01:00Z')).guard;
    await expect(tomorrow.assertWithinBudget()).resolves.toBeUndefined();
  });

  it('fails closed when the counter cannot be read', async () => {
    const { guard, metrics } = build(failingCounter);
    await expect(guard.assertWithinBudget()).rejects.toBeInstanceOf(AiTemporarilyUnavailableError);
    expect(metrics.breakerOpens).toEqual(['store_error']);
  });

  it('does not throw when recording fails', async () => {
    const { guard, logger } = build(failingCounter);
    await expect(guard.record(10)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it('ignores a zero cost', async () => {
    const counter = new MemoryAiSpendCounter();
    const add = vi.spyOn(counter, 'add');
    await build(counter).guard.record(0);
    expect(add).not.toHaveBeenCalled();
  });
});

describe('dailyBudgetMicros', () => {
  it('defaults to $10', () => {
    expect(dailyBudgetMicros({})).toBe(HOSTED_AI.DAILY_BUDGET_MICROS);
  });
  it('reads HOSTED_AI_DAILY_BUDGET_USD', () => {
    expect(dailyBudgetMicros({ HOSTED_AI_DAILY_BUDGET_USD: '2.5' })).toBe(2_500_000);
  });
  it('falls back on junk or negative values', () => {
    expect(dailyBudgetMicros({ HOSTED_AI_DAILY_BUDGET_USD: 'abc' })).toBe(
      HOSTED_AI.DAILY_BUDGET_MICROS,
    );
    expect(dailyBudgetMicros({ HOSTED_AI_DAILY_BUDGET_USD: '-1' })).toBe(
      HOSTED_AI.DAILY_BUDGET_MICROS,
    );
  });
});

describe('RedisAiSpendCounter', () => {
  it('creates the key with a TTL, then increments it', async () => {
    const redis = {
      get: vi.fn().mockResolvedValue('42'),
      set: vi.fn().mockResolvedValue('OK'),
      incrby: vi.fn().mockResolvedValue(42),
    };
    const counter = new RedisAiSpendCounter(redis);
    await counter.add('k', 41.6);
    expect(redis.set).toHaveBeenCalledWith('k', 0, { nx: true, px: expect.any(Number) });
    expect(redis.incrby).toHaveBeenCalledWith('k', 42);
    expect(await counter.get('k')).toBe(42);
  });

  it('reads a missing key as zero', async () => {
    const redis = { get: vi.fn().mockResolvedValue(null), set: vi.fn(), incrby: vi.fn() };
    expect(await new RedisAiSpendCounter(redis).get('k')).toBe(0);
  });
});
