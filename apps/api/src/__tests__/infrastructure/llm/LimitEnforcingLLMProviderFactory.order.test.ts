import { describe, it, expect, vi } from 'vitest';
import { LimitEnforcingLLMProviderFactory } from '#src/infrastructure/llm/LimitEnforcingLLMProviderFactory.js';
import { OrderedFallbackLLMProvider } from '#src/infrastructure/llm/OrderedFallbackLLMProvider.js';
import {
  AiCreditsExhaustedError,
  EmailNotVerifiedError,
  LlmLimitReachedError,
  LlmProviderError,
} from '#src/use-cases/errors/DomainError.js';
import { AI_FEATURE, LLM_USAGE_SOURCE } from '#src/use-cases/constants.js';
import type {
  ILLMProviderFactory,
  LLMProviderResolveHints,
} from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import {
  makeLLMProvider,
  makeLlmApiKey,
  makeLlmApiKeyRepository,
  makeLlmUsageEventRepository,
} from '#src/__tests__/helpers/mocks/llm.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { makeAiCreditService } from '#src/__tests__/helpers/mocks/plans.js';
import type { User } from '#src/domain/user/User.js';

const NOW = new Date('2026-03-15T12:00:00.000Z');

interface Setup {
  user?: Partial<User> | null;
  keys?: Array<{ provider: string; monthlyTokenLimit?: number | null; createdAt?: Date }>;
  /** Tokens already spent this month, by provider. */
  usedTokens?: Record<string, number>;
  hostedAiOn?: boolean;
  chargeImpl?: () => Promise<unknown>;
}

function build({
  user = {},
  keys = [{ provider: 'openai' }],
  usedTokens = {},
  hostedAiOn = true,
  chargeImpl,
}: Setup = {}) {
  /** What each resolution's provider is, so a test can tell which one answered. */
  const providers = new Map<string, ILLMProvider>();
  const providerFor = (label: string) => {
    if (!providers.has(label)) providers.set(label, makeLLMProvider(`from ${label}`));
    return providers.get(label)!;
  };

  const inner: ILLMProviderFactory = {
    forUser: vi.fn(),
    fromCredentials: vi.fn(),
    resolveForUser: vi.fn(async (_userId, request, hints?: LLMProviderResolveHints) => {
      const onPlatform = hints?.via === 'platform';
      return {
        provider: providerFor(onPlatform ? 'trakwyn' : (request.provider ?? 'unnamed')),
        providerId: onPlatform ? 'workersai' : (request.provider ?? 'unnamed'),
        fellBackFrom: null,
        source: onPlatform ? LLM_USAGE_SOURCE.PLATFORM : LLM_USAGE_SOURCE.BYOK,
      };
    }),
  };
  const aiCreditService = makeAiCreditService({
    charge: vi.fn(chargeImpl ?? (async () => ({ refund: vi.fn() }))) as never,
  });

  const factory = new LimitEnforcingLLMProviderFactory({
    userLlmProviderFactory: inner,
    userRepository: makeUserRepository({
      findById: vi
        .fn()
        .mockResolvedValue(
          user === null
            ? null
            : makeUser({ emailVerifiedAt: new Date('2026-01-01'), plan: 'pro', ...user }),
        ),
    }),
    llmApiKeyRepository: makeLlmApiKeyRepository({
      findAllByUserId: vi
        .fn()
        .mockResolvedValue(
          keys.map(({ provider, monthlyTokenLimit = null, createdAt = new Date('2026-01-01') }) =>
            makeLlmApiKey({ provider, monthlyTokenLimit, createdAt }),
          ),
        ),
    }),
    llmUsageEventRepository: makeLlmUsageEventRepository({
      summarizeByUserId: vi.fn().mockResolvedValue(
        Object.entries(usedTokens).map(([provider, tokens]) => ({
          provider,
          promptTokens: tokens,
          completionTokens: 0,
        })),
      ),
    }),
    platformLlmProviderFactory: {
      isEnabled: () => hostedAiOn,
      isEnabledFor: () => hostedAiOn,
      legs: () => [],
    },
    aiCreditService,
    now: () => NOW,
  });
  return { factory, inner, aiCreditService, providerFor };
}

const request = { feature: AI_FEATURE.CHAT } as const;
const calledWith = (inner: ILLMProviderFactory) =>
  vi
    .mocked(inner.resolveForUser)
    .mock.calls.map(([, req, hints]) => `${hints?.via ?? 'legacy'}:${req.provider ?? '-'}`);

describe('LimitEnforcingLLMProviderFactory: the user’s provider order (JEF-503)', () => {
  it('answers on the first provider in a saved order, not the default key', async () => {
    const { factory, inner } = build({
      user: { aiProviderOrder: ['anthropic', 'openai'], defaultLlmProvider: 'openai' },
      keys: [{ provider: 'openai' }, { provider: 'anthropic' }],
    });

    const resolution = await factory.resolveForUser('user-1', request);

    expect(resolution?.entry).toBe('anthropic');
    expect(resolution?.fellBackFrom).toBeNull();
    expect(calledWith(inner)).toEqual(['key:anthropic']);
  });

  it('never hands the caller’s model to a key it was not meant for', async () => {
    const { factory, inner } = build({ user: { aiProviderOrder: ['openai'] } });

    await factory.resolveForUser('user-1', { ...request, model: 'gpt-something' });

    expect(vi.mocked(inner.resolveForUser).mock.calls[0][1].model).toBeNull();
  });

  it('answers on Trakwyn AI when it is first, and charges for it', async () => {
    const { factory, aiCreditService } = build({
      user: { aiProviderOrder: ['trakwyn', 'openai'] },
    });

    const resolution = await factory.resolveForUser('user-1', request);

    expect(resolution?.entry).toBe('trakwyn');
    expect(resolution?.source).toBe(LLM_USAGE_SOURCE.PLATFORM);
    expect(aiCreditService.charge).toHaveBeenCalledTimes(1);
  });

  describe('when an entry cannot run, the next listed one does', () => {
    it('skips a key paused at its monthly limit and says which one it skipped', async () => {
      const { factory } = build({
        user: { aiProviderOrder: ['anthropic', 'openai'] },
        keys: [{ provider: 'anthropic', monthlyTokenLimit: 1000 }, { provider: 'openai' }],
        usedTokens: { anthropic: 1000 },
      });

      const resolution = await factory.resolveForUser('user-1', request);

      expect(resolution?.entry).toBe('openai');
      expect(resolution?.fellBackFrom).toBe('anthropic');
    });

    it('skips Trakwyn AI when credits are exhausted, so the user’s own key answers', async () => {
      const { factory } = build({
        user: { aiProviderOrder: ['trakwyn', 'openai'] },
        chargeImpl: async () => {
          throw new AiCreditsExhaustedError(300, new Date('2026-04-01T00:00:00.000Z'));
        },
      });

      const resolution = await factory.resolveForUser('user-1', request);

      expect(resolution?.entry).toBe('openai');
      expect(resolution?.fellBackFrom).toBe('trakwyn');
    });

    it('skips an entry whose key was deleted without saying anything', async () => {
      const { factory } = build({
        user: { aiProviderOrder: ['groq', 'openai'] },
        keys: [{ provider: 'openai' }],
      });

      const resolution = await factory.resolveForUser('user-1', request);

      expect(resolution?.entry).toBe('openai');
      expect(resolution?.fellBackFrom).toBeNull();
    });

    it('skips Trakwyn AI without a word when hosted AI is off for the user', async () => {
      const { factory, aiCreditService } = build({
        user: { aiProviderOrder: ['trakwyn', 'openai'] },
        hostedAiOn: false,
      });

      const resolution = await factory.resolveForUser('user-1', request);

      expect(resolution?.entry).toBe('openai');
      expect(resolution?.fellBackFrom).toBeNull();
      expect(aiCreditService.charge).not.toHaveBeenCalled();
    });
  });

  describe('never runs on a provider the user did not list', () => {
    it('refuses with the limit error rather than use another saved key', async () => {
      const { factory, inner } = build({
        user: { aiProviderOrder: ['openai'], llmFallbackWhenLimited: true },
        keys: [{ provider: 'openai', monthlyTokenLimit: 1000 }, { provider: 'anthropic' }],
        usedTokens: { openai: 1000 },
      });

      const err = await factory.resolveForUser('user-1', request).catch((e) => e);

      expect(err).toBeInstanceOf(LlmLimitReachedError);
      expect(calledWith(inner)).not.toContain('key:anthropic');
    });

    it('does not reach for Trakwyn AI when the user listed only their own key', async () => {
      const { factory, aiCreditService } = build({
        user: { aiProviderOrder: ['openai'] },
        keys: [{ provider: 'openai', monthlyTokenLimit: 1000 }],
        usedTokens: { openai: 1000 },
      });

      await expect(factory.resolveForUser('user-1', request)).rejects.toBeInstanceOf(
        LlmLimitReachedError,
      );
      expect(aiCreditService.charge).not.toHaveBeenCalled();
    });

    it('fails with the first entry’s own error when every entry was skipped', async () => {
      const { factory } = build({
        user: { aiProviderOrder: ['trakwyn'] },
        chargeImpl: async () => {
          throw new AiCreditsExhaustedError(300, new Date('2026-04-01T00:00:00.000Z'));
        },
      });

      await expect(factory.resolveForUser('user-1', request)).rejects.toBeInstanceOf(
        AiCreditsExhaustedError,
      );
    });

    it('does not fall through on a failure another provider cannot fix', async () => {
      const { factory } = build({
        user: { aiProviderOrder: ['trakwyn', 'openai'], emailVerifiedAt: null },
      });

      await expect(factory.resolveForUser('user-1', request)).rejects.toBeInstanceOf(
        EmailNotVerifiedError,
      );
    });
  });

  describe('with no saved order, the older settings behave as before', () => {
    it('uses the default key and skips Trakwyn AI under auto', async () => {
      const { factory } = build({
        user: { aiSource: 'auto', defaultLlmProvider: 'openai' },
        keys: [{ provider: 'openai' }],
      });

      const resolution = await factory.resolveForUser('user-1', request);

      expect(resolution?.entry).toBe('openai');
    });

    it('falls to the next key at a limit only when the user opted in', async () => {
      const keys = [
        { provider: 'openai', monthlyTokenLimit: 1000, createdAt: new Date('2026-01-01') },
        { provider: 'anthropic', createdAt: new Date('2026-02-01') },
      ];
      const optedIn = build({
        user: { defaultLlmProvider: 'openai', llmFallbackWhenLimited: true },
        keys,
        usedTokens: { openai: 1000 },
      });
      const optedOut = build({
        user: { defaultLlmProvider: 'openai', llmFallbackWhenLimited: false },
        keys,
        usedTokens: { openai: 1000 },
      });

      expect((await optedIn.factory.resolveForUser('user-1', request))?.entry).toBe('anthropic');
      await expect(optedOut.factory.resolveForUser('user-1', request)).rejects.toBeInstanceOf(
        LlmLimitReachedError,
      );
    });

    it('answers a paid user with no key on Trakwyn AI under auto', async () => {
      const { factory } = build({ user: { aiSource: 'auto' }, keys: [] });

      expect((await factory.resolveForUser('user-1', request))?.entry).toBe('trakwyn');
    });

    it('resolves nothing for a free user with no key, so the caller reports AI_NOT_CONFIGURED', async () => {
      const { factory } = build({
        user: { aiSource: 'auto', plan: 'free', planExpiresAt: null },
        keys: [],
      });

      expect(await factory.resolveForUser('user-1', request)).toBeNull();
    });
  });

  describe('while the call runs', () => {
    const failing = (): ILLMProvider => ({
      complete: vi.fn().mockRejectedValue(new LlmProviderError('unavailable', { status: 503 })),
      completeWithToolsStream: vi.fn(),
    });

    it('does not wrap the provider when there is nothing after it', async () => {
      const { factory, providerFor } = build({ user: { aiProviderOrder: ['openai'] } });

      const resolution = await factory.resolveForUser('user-1', request);

      expect(resolution?.provider).toBe(providerFor('openai'));
    });

    it('moves to the next entry when the provider fails, and charges for Trakwyn AI only then', async () => {
      const { factory, inner, aiCreditService, providerFor } = build({
        user: { aiProviderOrder: ['openai', 'trakwyn'] },
      });
      // The user's own key fails when called.
      const primary = failing();
      vi.mocked(inner.resolveForUser).mockImplementationOnce(async () => ({
        provider: primary,
        providerId: 'openai',
        fellBackFrom: null,
        source: LLM_USAGE_SOURCE.BYOK,
      }));

      const resolution = await factory.resolveForUser('user-1', request);

      expect(resolution?.provider).toBeInstanceOf(OrderedFallbackLLMProvider);
      expect(aiCreditService.charge).not.toHaveBeenCalled();

      const result = await resolution!.provider.complete([]);

      expect(result.content).toBe('from trakwyn');
      expect(aiCreditService.charge).toHaveBeenCalledTimes(1);
      expect(providerFor('trakwyn')).toBeDefined();
    });

    it('fails with the provider’s own error when nothing else in the order can run', async () => {
      const { factory, inner } = build({
        user: { aiProviderOrder: ['openai', 'anthropic'] },
        keys: [{ provider: 'openai' }, { provider: 'anthropic', monthlyTokenLimit: 1 }],
        usedTokens: { anthropic: 5 },
      });
      vi.mocked(inner.resolveForUser).mockImplementationOnce(async () => ({
        provider: failing(),
        providerId: 'openai',
        fellBackFrom: null,
        source: LLM_USAGE_SOURCE.BYOK,
      }));

      const resolution = await factory.resolveForUser('user-1', request);

      await expect(resolution!.provider.complete([])).rejects.toBeInstanceOf(LlmProviderError);
    });
  });

  it('leaves a call that names a key on the single-key path', async () => {
    const { factory, inner } = build({
      user: { aiProviderOrder: ['anthropic'] },
      keys: [{ provider: 'openai' }, { provider: 'anthropic' }],
    });

    const resolution = await factory.resolveForUser('user-1', { ...request, provider: 'openai' });

    expect(resolution?.entry).toBeUndefined();
    expect(calledWith(inner)).toEqual(['legacy:openai']);
  });

  it('leaves a key test on the single-key path', async () => {
    const { factory, inner } = build({ user: { aiProviderOrder: ['anthropic'] } });

    await factory.resolveForUser('user-1', {
      feature: AI_FEATURE.KEY_TEST,
      provider: 'openai',
      trackUsage: false,
    });

    expect(calledWith(inner)).toEqual(['legacy:openai']);
  });
});
