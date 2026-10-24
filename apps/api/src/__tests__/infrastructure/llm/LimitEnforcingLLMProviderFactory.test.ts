import { describe, it, expect, vi } from 'vitest';
import { LimitEnforcingLLMProviderFactory } from '#src/infrastructure/llm/LimitEnforcingLLMProviderFactory.js';
import { LlmLimitReachedError } from '#src/use-cases/errors/DomainError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import {
  makeLlmApiKey,
  makeLlmApiKeyRepository,
  makeLlmUsageEventRepository,
} from '#src/__tests__/helpers/mocks/llm.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import {
  makeEntitlementService,
  makeEntitlements,
  makeFreeEntitlements,
} from '#src/__tests__/helpers/mocks/plans.js';
import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';
import { PlanRequiredError } from '#src/use-cases/errors/DomainError.js';

const NOW = new Date('2026-03-15T12:00:00.000Z');
const NEXT_RESET = new Date('2026-04-01T00:00:00.000Z');

const spent = (provider: string, promptTokens: number, completionTokens = 0) => ({
  provider,
  requestCount: 1,
  promptTokens,
  completionTokens,
  lastUsedAt: NOW,
});

const key = (provider: string, monthlyTokenLimit: number | null, daysOld = 0) =>
  makeLlmApiKey({
    provider,
    monthlyTokenLimit,
    createdAt: new Date(NOW.getTime() - daysOld * 86_400_000),
  });

function build({
  keys = [key('openai', null)],
  usage = [] as ReturnType<typeof spent>[],
  defaultLlmProvider = 'openai' as string | null,
  llmFallbackWhenLimited = false,
  // Plans not enforced, so the pre-existing cases below see no allowance.
  entitlementService = makeEntitlementService({ enforced: false }) as IEntitlementService,
}) {
  const provider = { complete: vi.fn(), completeWithToolsStream: vi.fn() };
  const inner = {
    forUser: vi.fn().mockResolvedValue(provider),
    resolveForUser: vi.fn().mockImplementation(async (_userId: string, requested?: string) => ({
      provider,
      providerId: requested ?? defaultLlmProvider ?? 'openai',
      fellBackFrom: null,
    })),
    fromCredentials: vi.fn().mockReturnValue(provider),
  };
  const llmUsageEventRepository = makeLlmUsageEventRepository({
    summarizeByUserId: vi.fn().mockResolvedValue(usage),
  });
  const factory = new LimitEnforcingLLMProviderFactory({
    userLlmProviderFactory: inner,
    userRepository: makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ defaultLlmProvider, llmFallbackWhenLimited })),
    }),
    llmApiKeyRepository: makeLlmApiKeyRepository({
      findAllByUserId: vi.fn().mockResolvedValue(keys),
    }),
    llmUsageEventRepository,
    entitlementService,
    now: () => NOW,
  });
  return { factory, inner, provider, llmUsageEventRepository };
}

describe('LimitEnforcingLLMProviderFactory', () => {
  describe('enforcement', () => {
    it('passes through when the key has no limit', async () => {
      const { factory, provider } = build({
        keys: [key('openai', null)],
        usage: [spent('openai', 9_999_999)],
      });

      await expect(factory.forUser('user-1', 'openai')).resolves.toBe(provider);
    });

    it('passes through while usage is below the limit', async () => {
      const { factory, provider } = build({
        keys: [key('openai', 200)],
        usage: [spent('openai', 100, 99)],
      });

      await expect(factory.forUser('user-1', 'openai')).resolves.toBe(provider);
    });

    it('refuses once the combined tokens meet the limit', async () => {
      const { factory, inner } = build({
        keys: [key('openai', 200)],
        usage: [spent('openai', 100, 100)],
      });

      await expect(factory.forUser('user-1', 'openai')).rejects.toThrow(LlmLimitReachedError);
      expect(inner.resolveForUser).not.toHaveBeenCalled();
    });

    it('reports the provider and when the allowance refills', async () => {
      const { factory } = build({ keys: [key('openai', 10)], usage: [spent('openai', 10)] });

      await expect(factory.forUser('user-1', 'openai')).rejects.toMatchObject({
        provider: 'openai',
        resetsAt: NEXT_RESET,
        code: ERROR_CODES.AI_LIMIT_REACHED,
      });
    });

    it('resolves the default provider when none is named', async () => {
      const { factory } = build({ keys: [key('openai', 10)], usage: [spent('openai', 10)] });

      await expect(factory.forUser('user-1')).rejects.toThrow(LlmLimitReachedError);
    });

    it('defers to the inner factory when the user has no default provider', async () => {
      const { factory, inner } = build({ defaultLlmProvider: null });

      await factory.forUser('user-1');

      expect(inner.resolveForUser).toHaveBeenCalled();
    });

    it('ignores another provider’s usage', async () => {
      const { factory, provider } = build({
        keys: [key('openai', 200)],
        usage: [spent('anthropic', 9_999)],
      });

      await expect(factory.forUser('user-1', 'openai')).resolves.toBe(provider);
    });

    it('does not enforce a limit on an untracked call', async () => {
      const { factory, provider } = build({
        keys: [key('openai', 10)],
        usage: [spent('openai', 9_999)],
      });

      await expect(factory.forUser('user-1', 'openai', null, false)).resolves.toBe(provider);
    });

    it('leaves fromCredentials alone — there is no saved key to have a limit', () => {
      const { factory, provider } = build({ keys: [key('openai', 1)] });

      expect(factory.fromCredentials({ provider: 'openai', apiKey: 'sk-test' })).toBe(provider);
    });
  });

  describe('opt-in fallback (JEF-258)', () => {
    it('refuses rather than substituting when the user has not opted in', async () => {
      const { factory } = build({
        keys: [key('openai', 10), key('anthropic', null)],
        usage: [spent('openai', 10)],
        llmFallbackWhenLimited: false,
      });

      await expect(factory.forUser('user-1', 'openai')).rejects.toThrow(LlmLimitReachedError);
    });

    it('uses another key with headroom when the user has opted in', async () => {
      const { factory, inner } = build({
        keys: [key('openai', 10), key('anthropic', null)],
        usage: [spent('openai', 10)],
        llmFallbackWhenLimited: true,
      });

      const resolution = await factory.resolveForUser('user-1', 'openai');

      expect(resolution).toMatchObject({ providerId: 'anthropic', fellBackFrom: 'openai' });
      expect(inner.resolveForUser).toHaveBeenCalledWith(
        'user-1',
        'anthropic',
        null,
        true,
        expect.anything(),
      );
    });

    /** Oldest first, so the stand-in does not change from call to call. */
    it('picks the oldest key with headroom', async () => {
      const { factory } = build({
        keys: [key('openai', 10), key('mistral', null, 1), key('anthropic', null, 30)],
        usage: [spent('openai', 10)],
        llmFallbackWhenLimited: true,
      });

      const resolution = await factory.resolveForUser('user-1', 'openai');

      expect(resolution).toMatchObject({ providerId: 'anthropic' });
    });

    it('skips a substitute that is itself at its limit', async () => {
      const { factory } = build({
        keys: [key('openai', 10), key('anthropic', 50, 30), key('mistral', null, 20)],
        usage: [spent('openai', 10), spent('anthropic', 50)],
        llmFallbackWhenLimited: true,
      });

      const resolution = await factory.resolveForUser('user-1', 'openai');

      expect(resolution).toMatchObject({ providerId: 'mistral' });
    });

    it('refuses when every key is at its limit', async () => {
      const { factory } = build({
        keys: [key('openai', 10), key('anthropic', 50)],
        usage: [spent('openai', 10), spent('anthropic', 50)],
        llmFallbackWhenLimited: true,
      });

      await expect(factory.forUser('user-1', 'openai')).rejects.toMatchObject({
        provider: 'openai',
      });
    });

    it('refuses when there is no other key at all', async () => {
      const { factory } = build({
        keys: [key('openai', 10)],
        usage: [spent('openai', 10)],
        llmFallbackWhenLimited: true,
      });

      await expect(factory.forUser('user-1', 'openai')).rejects.toThrow(LlmLimitReachedError);
    });

    /**
     * A model name belongs to the provider that defines it, so the caller's
     * is not carried across to a stand-in that has never heard of it.
     */
    it('lets the substitute use its own model, not the paused key’s', async () => {
      const { factory, inner } = build({
        keys: [key('openai', 10), key('anthropic', null)],
        usage: [spent('openai', 10)],
        llmFallbackWhenLimited: true,
      });

      await factory.resolveForUser('user-1', 'openai', 'gpt-4o-mini');

      expect(inner.resolveForUser).toHaveBeenCalledWith(
        'user-1',
        'anthropic',
        null,
        true,
        expect.anything(),
      );
    });

    it('reports no fallback on the ordinary path', async () => {
      const { factory } = build({ keys: [key('openai', 200)], usage: [spent('openai', 10)] });

      await expect(factory.resolveForUser('user-1', 'openai')).resolves.toMatchObject({
        fellBackFrom: null,
      });
    });
  });

  describe('round-trips (F9)', () => {
    it('hands the key it already loaded to the inner factory, so it is not fetched twice', async () => {
      const openai = key('openai', null);
      const { factory, inner } = build({ keys: [openai] });

      await factory.forUser('user-1', 'openai');

      expect(inner.resolveForUser).toHaveBeenCalledWith('user-1', 'openai', undefined, true, {
        user: undefined,
        key: openai,
      });
    });

    it('loads the user once when the default provider is needed, and passes it down', async () => {
      const openai = key('openai', null);
      const { factory, inner } = build({ keys: [openai], defaultLlmProvider: 'openai' });

      await factory.forUser('user-1');

      const [, , , , hints] = vi.mocked(inner.resolveForUser).mock.calls[0];
      expect(hints?.user?.defaultLlmProvider).toBe('openai');
      expect(hints?.key).toBe(openai);
    });

    it('hands the substitute key down when falling back', async () => {
      const paused = key('openai', 100, 2);
      const spare = key('anthropic', null, 1);
      const { factory, inner } = build({
        keys: [paused, spare],
        usage: [spent('openai', 100)],
        llmFallbackWhenLimited: true,
      });

      await factory.forUser('user-1', 'openai');

      const [, providerId, , , hints] = vi.mocked(inner.resolveForUser).mock.calls[0];
      expect(providerId).toBe('anthropic');
      expect(hints?.key).toBe(spare);
    });
  });
  describe('Free AI allowance (JEF-344)', () => {
    const freeService = (enforced = true) =>
      makeEntitlementService({
        enforced,
        forUser: vi.fn().mockReturnValue(makeFreeEntitlements()),
      });
    const requests = (count: number) => [{ ...spent('openai', 10), requestCount: count }];

    it('allows an action while the month is under the allowance', async () => {
      const { factory, provider } = build({
        usage: requests(4),
        entitlementService: freeService(),
      });

      await expect(factory.forUser('user-1', 'openai')).resolves.toBe(provider);
    });

    it('refuses the sixth action of the month with PlanRequiredError', async () => {
      const { factory, inner } = build({
        usage: requests(5),
        entitlementService: freeService(),
      });

      const err = await factory.forUser('user-1', 'openai').catch((e) => e);

      expect(err).toBeInstanceOf(PlanRequiredError);
      expect((err as Error).message).toMatch(/5 AI actions a month/);
      expect(inner.resolveForUser).not.toHaveBeenCalled();
    });

    it('counts requests across every provider', async () => {
      const { factory } = build({
        usage: [
          { ...spent('openai', 10), requestCount: 3 },
          { ...spent('anthropic', 10), requestCount: 2 },
        ],
        entitlementService: freeService(),
      });

      await expect(factory.forUser('user-1', 'openai')).rejects.toBeInstanceOf(PlanRequiredError);
    });

    it('counts only this calendar month', async () => {
      const { factory, llmUsageEventRepository } = build({
        usage: requests(1),
        entitlementService: freeService(),
      });

      await factory.forUser('user-1', 'openai');

      const [, since] = vi.mocked(llmUsageEventRepository.summarizeByUserId).mock.calls[0];
      expect(since).toEqual(new Date('2026-03-01T00:00:00.000Z'));
    });

    it('has no allowance on Pro, and does not even read the month usage', async () => {
      const entitlementService = makeEntitlementService({
        forUser: vi.fn().mockReturnValue(makeEntitlements()),
      });
      const { factory, provider } = build({
        keys: [key('openai', null)],
        usage: requests(500),
        entitlementService,
      });

      await expect(factory.forUser('user-1', 'openai')).resolves.toBe(provider);
    });

    it('does nothing when plans are not enforced, without loading anything extra', async () => {
      const { factory, provider } = build({
        usage: requests(500),
        entitlementService: freeService(false),
      });

      await expect(factory.forUser('user-1', 'openai')).resolves.toBe(provider);
    });

    it('does not count a key test, which is not real usage', async () => {
      const { factory, provider } = build({
        usage: requests(500),
        entitlementService: freeService(),
      });

      await expect(factory.forUser('user-1', 'openai', null, false)).resolves.toBe(provider);
    });
  });
});
