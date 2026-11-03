import { describe, it, expect, vi } from 'vitest';
import { LimitEnforcingLLMProviderFactory } from '#src/infrastructure/llm/LimitEnforcingLLMProviderFactory.js';
import { HostedAiSpendGuard } from '#src/infrastructure/llm/HostedAiSpendGuard.js';
import { MemoryAiSpendCounter } from '#src/infrastructure/cache/MemoryAiSpendCounter.js';
import { RateLimiter } from '#src/infrastructure/rateLimit/RateLimiter.js';
import {
  AiTemporarilyUnavailableError,
  EmailNotVerifiedError,
  RateLimitedError,
} from '#src/use-cases/errors/DomainError.js';
import { AI_FEATURE, LLM_USAGE_SOURCE, type LlmUsageSource } from '#src/use-cases/constants.js';
import { RATE_LIMIT } from '#src/http/constants.js';
import {
  makeLlmApiKey,
  makeLlmApiKeyRepository,
  makeLlmUsageEventRepository,
} from '#src/__tests__/helpers/mocks/llm.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { makeAiCreditService } from '#src/__tests__/helpers/mocks/plans.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeFakeMetrics } from '#src/__tests__/helpers/fakeMetrics.js';
import type { IAiSpendCounter } from '#src/infrastructure/cache/IAiSpendCounter.js';

const NOW = new Date('2026-03-15T12:00:00.000Z');

function build(
  source: LlmUsageSource,
  opts: { verified?: boolean; counter?: IAiSpendCounter; budget?: number } = {},
) {
  const { verified = true, counter = new MemoryAiSpendCounter(), budget = 1_000 } = opts;
  const provider = { complete: vi.fn(), completeWithToolsStream: vi.fn() };
  const inner = {
    forUser: vi.fn(),
    resolveForUser: vi
      .fn()
      .mockResolvedValue({ provider, providerId: 'openai', fellBackFrom: null, source }),
    fromCredentials: vi.fn(),
  };
  const aiCreditService = makeAiCreditService();
  const metrics = makeFakeMetrics();
  const factory = new LimitEnforcingLLMProviderFactory({
    userLlmProviderFactory: inner,
    userRepository: makeUserRepository({
      findById: vi.fn().mockResolvedValue(
        makeUser({
          defaultLlmProvider: 'openai',
          emailVerifiedAt: verified ? new Date('2026-01-01') : null,
        }),
      ),
    }),
    llmApiKeyRepository: makeLlmApiKeyRepository({
      findAllByUserId: vi.fn().mockResolvedValue([makeLlmApiKey({ provider: 'openai' })]),
    }),
    llmUsageEventRepository: makeLlmUsageEventRepository({
      summarizeByUserId: vi.fn().mockResolvedValue([]),
    }),
    now: () => NOW,
    aiCreditService,
    hostedAiRateLimiter: new RateLimiter(
      RATE_LIMIT.HOSTED_AI.MAX_ATTEMPTS,
      RATE_LIMIT.HOSTED_AI.WINDOW_MS,
    ),
    aiSpendGuard: new HostedAiSpendGuard({
      counter,
      logger: makeLogger(),
      metrics,
      now: () => NOW,
      budgetMicros: () => budget,
    }),
  });
  return { factory, aiCreditService, counter, metrics };
}

const request = { feature: AI_FEATURE.CHAT };

describe('hosted AI spend guards (JEF-449)', () => {
  describe('verified email', () => {
    it('refuses an unverified user on the platform key, before charging a credit', async () => {
      const { factory, aiCreditService } = build(LLM_USAGE_SOURCE.PLATFORM, { verified: false });
      const err = await factory.resolveForUser('u1', request).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(EmailNotVerifiedError);
      expect((err as Error).message).toBe('Verify your email to use Trakwyn AI.');
      expect(aiCreditService.charge).not.toHaveBeenCalled();
    });

    it('leaves an unverified user on their own key alone', async () => {
      const { factory } = build(LLM_USAGE_SOURCE.BYOK, { verified: false });
      await expect(factory.resolveForUser('u1', request)).resolves.not.toBeNull();
    });

    it('leaves a key test alone', async () => {
      const { factory } = build(LLM_USAGE_SOURCE.PLATFORM, { verified: false });
      await expect(
        factory.resolveForUser('u1', { feature: AI_FEATURE.KEY_TEST, trackUsage: false }),
      ).resolves.not.toBeNull();
    });
  });

  describe('rate limit', () => {
    it('lets ten hosted calls through and refuses the 11th with RATE_LIMITED', async () => {
      const { factory } = build(LLM_USAGE_SOURCE.PLATFORM);
      for (let i = 0; i < 10; i++) await factory.resolveForUser('u1', request);
      await expect(factory.resolveForUser('u1', request)).rejects.toBeInstanceOf(RateLimitedError);
    });

    it('counts each user apart', async () => {
      const { factory } = build(LLM_USAGE_SOURCE.PLATFORM);
      for (let i = 0; i < 10; i++) await factory.resolveForUser('u1', request);
      await expect(factory.resolveForUser('u2', request)).resolves.not.toBeNull();
    });

    it('never limits calls on the user’s own key', async () => {
      const { factory } = build(LLM_USAGE_SOURCE.BYOK);
      for (let i = 0; i < 15; i++) await factory.resolveForUser('u1', request);
    });
  });

  describe('daily breaker', () => {
    it('refuses hosted calls once the day’s budget is spent', async () => {
      const { factory, counter, aiCreditService } = build(LLM_USAGE_SOURCE.PLATFORM);
      await counter.add('hosted-ai:spend:2026-03-15', 1_000);
      await expect(factory.resolveForUser('u1', request)).rejects.toBeInstanceOf(
        AiTemporarilyUnavailableError,
      );
      expect(aiCreditService.charge).not.toHaveBeenCalled();
    });

    it('refuses hosted calls when the store is down (fails closed)', async () => {
      const down: IAiSpendCounter = {
        get: vi.fn().mockRejectedValue(new Error('redis down')),
        add: vi.fn().mockRejectedValue(new Error('redis down')),
      };
      const { factory, metrics } = build(LLM_USAGE_SOURCE.PLATFORM, { counter: down });
      await expect(factory.resolveForUser('u1', request)).rejects.toBeInstanceOf(
        AiTemporarilyUnavailableError,
      );
      expect(metrics.breakerOpens).toEqual(['store_error']);
    });

    it('does not touch own-key calls, over budget or with the store down', async () => {
      const down: IAiSpendCounter = {
        get: vi.fn().mockRejectedValue(new Error('redis down')),
        add: vi.fn(),
      };
      const { factory } = build(LLM_USAGE_SOURCE.BYOK, { counter: down });
      await expect(factory.resolveForUser('u1', request)).resolves.not.toBeNull();
      expect(down.get).not.toHaveBeenCalled();
    });
  });
});
