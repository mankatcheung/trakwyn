import { describe, it, expect, vi } from 'vitest';
import { UserLLMProviderFactory } from '#src/infrastructure/llm/UserLLMProviderFactory.js';
import { LimitEnforcingLLMProviderFactory } from '#src/infrastructure/llm/LimitEnforcingLLMProviderFactory.js';
import { FailoverLLMProvider } from '#src/infrastructure/llm/FailoverLLMProvider.js';
import { LLM_PROVIDER, AI_FEATURE } from '#src/use-cases/constants.js';
import { LlmLimitReachedError } from '#src/use-cases/errors/DomainError.js';
import type { IPlatformLLMProviderFactory } from '#src/use-cases/ports/IPlatformLLMProviderFactory.js';
import {
  makeLLMProvider,
  makeLlmApiKey,
  makeLlmApiKeyCipher,
  makeLlmApiKeyRepository,
  makeLlmUsageEventRepository,
} from '#src/__tests__/helpers/mocks/llm.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { makeLogger, makeOutboundUrlPolicy } from '#src/__tests__/helpers/mocks/infrastructure.js';

const usage = { promptTokens: 10, completionTokens: 5 };

function leg(text: string): ReturnType<typeof makeLLMProvider> {
  const provider = makeLLMProvider(text);
  provider.complete = vi.fn().mockResolvedValue({ content: text, usage });
  return provider;
}

function platform(enabled: boolean, legCount = 2): IPlatformLLMProviderFactory {
  const legs = [
    { providerId: 'googleai', model: 'gemini-2.5-flash-lite', provider: leg('gemini') },
    { providerId: 'openai', model: 'gpt-5.6-luna', provider: leg('gpt') },
  ].slice(0, legCount);
  return {
    isEnabled: () => enabled,
    isEnabledFor: () => enabled,
    legs: vi.fn(() => (enabled ? legs : [])),
  };
}

function build(opts: {
  aiSource: 'auto' | 'trakwyn' | 'own';
  hasKey: boolean;
  platformFactory?: IPlatformLLMProviderFactory;
  defaultLlmProvider?: string | null;
  plan?: 'free' | 'pro';
}) {
  const user = makeUser({
    aiSource: opts.aiSource,
    emailVerifiedAt: new Date('2026-01-01'),
    plan: opts.plan ?? 'pro',
    planExpiresAt: null,
    defaultLlmProvider: opts.defaultLlmProvider ?? (opts.hasKey ? LLM_PROVIDER.OPENAI : null),
  });
  const key = makeLlmApiKey({ provider: LLM_PROVIDER.OPENAI });
  const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
  const llmApiKeyRepository = makeLlmApiKeyRepository({
    findByUserIdAndProvider: vi.fn().mockResolvedValue(opts.hasKey ? key : null),
    findAllByUserId: vi.fn().mockResolvedValue(opts.hasKey ? [key] : []),
  });
  const llmUsageEventRepository = makeLlmUsageEventRepository();
  const platformFactory = opts.platformFactory ?? platform(true);
  const inner = new UserLLMProviderFactory({
    userRepository,
    llmApiKeyRepository,
    llmApiKeyCipher: makeLlmApiKeyCipher(),
    outboundUrlPolicy: makeOutboundUrlPolicy(),
    llmUsageEventRepository,
    logger: makeLogger(),
    generateId: () => 'evt-id',
    platformLlmProviderFactory: platformFactory,
  });
  const limited = new LimitEnforcingLLMProviderFactory({
    userLlmProviderFactory: inner,
    userRepository,
    llmApiKeyRepository,
    llmUsageEventRepository,
    now: () => new Date('2026-11-02T00:00:00Z'),
    platformLlmProviderFactory: platformFactory,
  });
  return { inner, limited, llmUsageEventRepository, platformFactory };
}

const request = { feature: AI_FEATURE.CHAT };

describe('platform resolution', () => {
  it('gives a user with no key a platform provider, recorded as platform', async () => {
    const { limited, llmUsageEventRepository } = build({ aiSource: 'auto', hasKey: false });

    const resolution = await limited.resolveForUser('user-1', request);

    expect(resolution?.source).toBe('platform');
    expect(resolution?.providerId).toBe('googleai');
    expect(resolution?.provider).toBeInstanceOf(FailoverLLMProvider);

    await resolution!.provider.complete([]);
    expect(llmUsageEventRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'platform', provider: 'googleai' }),
    );
  });

  it('keeps AI_NOT_CONFIGURED (null) for a Free user with no key: hosted AI is Pro-only (JEF-451)', async () => {
    const { limited, platformFactory } = build({ aiSource: 'auto', hasKey: false, plan: 'free' });

    expect(await limited.resolveForUser('user-1', request)).toBeNull();
    expect(platformFactory.legs).not.toHaveBeenCalled();
  });

  it.each(['auto', 'trakwyn'] as const)(
    'keeps AI_NOT_CONFIGURED (null) for a %s user outside the rollout (JEF-453)',
    async (aiSource) => {
      const platformFactory = { ...platform(true), isEnabledFor: vi.fn(() => false) };
      const { limited } = build({ aiSource, hasKey: false, platformFactory });

      expect(await limited.resolveForUser('user-1', request)).toBeNull();
      expect(platformFactory.isEnabledFor).toHaveBeenCalledWith('user-1');
      expect(platformFactory.legs).not.toHaveBeenCalled();
    },
  );

  it('keeps AI_NOT_CONFIGURED (null) when the flag is off', async () => {
    const { limited } = build({
      aiSource: 'auto',
      hasKey: false,
      platformFactory: platform(false),
    });

    expect(await limited.resolveForUser('user-1', request)).toBeNull();
  });

  it('keeps the own key for auto when one is set', async () => {
    const { limited, platformFactory } = build({ aiSource: 'auto', hasKey: true });

    const resolution = await limited.resolveForUser('user-1', request);

    expect(resolution?.source).toBe('byok');
    expect(resolution?.providerId).toBe(LLM_PROVIDER.OPENAI);
    expect(platformFactory.legs).not.toHaveBeenCalled();
  });

  it('uses the platform for trakwyn even when a key is set', async () => {
    const { limited } = build({ aiSource: 'trakwyn', hasKey: true });

    const resolution = await limited.resolveForUser('user-1', request);

    expect(resolution?.source).toBe('platform');
  });

  it('does not enforce the own key limit on a trakwyn user', async () => {
    const { limited, llmUsageEventRepository } = build({ aiSource: 'trakwyn', hasKey: true });
    vi.mocked(llmUsageEventRepository.summarizeByUserId).mockResolvedValue([
      { provider: LLM_PROVIDER.OPENAI, promptTokens: 10_000_000, completionTokens: 0 },
    ] as never);

    await expect(limited.resolveForUser('user-1', request)).resolves.toMatchObject({
      source: 'platform',
    });
  });

  it('never uses the platform for own, with or without a key', async () => {
    const withKey = build({ aiSource: 'own', hasKey: true });
    const without = build({ aiSource: 'own', hasKey: false });

    expect((await withKey.limited.resolveForUser('user-1', request))?.source).toBe('byok');
    expect(await without.limited.resolveForUser('user-1', request)).toBeNull();
    expect(withKey.platformFactory.legs).not.toHaveBeenCalled();
    expect(without.platformFactory.legs).not.toHaveBeenCalled();
  });

  it('still refuses a paused own key for auto (limits unchanged)', async () => {
    const { limited, llmUsageEventRepository } = build({ aiSource: 'auto', hasKey: true });
    vi.mocked(llmUsageEventRepository.summarizeByUserId).mockResolvedValue([
      { provider: LLM_PROVIDER.OPENAI, promptTokens: 1000, completionTokens: 1000 },
    ] as never);
    const keyRepo = (
      limited as unknown as {
        deps: { llmApiKeyRepository: { findAllByUserId: ReturnType<typeof vi.fn> } };
      }
    ).deps.llmApiKeyRepository;
    keyRepo.findAllByUserId.mockResolvedValue([
      makeLlmApiKey({ provider: LLM_PROVIDER.OPENAI, monthlyTokenLimit: 100 }),
    ]);

    await expect(limited.resolveForUser('user-1', request)).rejects.toBeInstanceOf(
      LlmLimitReachedError,
    );
  });

  it('does not use the platform when the caller names a provider for an auto user', async () => {
    const { limited } = build({ aiSource: 'auto', hasKey: false });

    const resolution = await limited.resolveForUser('user-1', {
      ...request,
      provider: LLM_PROVIDER.ANTHROPIC,
    });

    expect(resolution).toBeNull();
  });

  it('never routes a key test to the platform', async () => {
    const { limited, platformFactory } = build({ aiSource: 'trakwyn', hasKey: true });

    const resolution = await limited.resolveForUser('user-1', {
      ...request,
      feature: AI_FEATURE.KEY_TEST,
      provider: LLM_PROVIDER.OPENAI,
      trackUsage: false,
    });

    expect(resolution?.source).toBe('byok');
    expect(platformFactory.legs).not.toHaveBeenCalled();
  });

  it('has no failover wrapper when only one platform leg is configured', async () => {
    const { limited } = build({
      aiSource: 'auto',
      hasKey: false,
      platformFactory: platform(true, 1),
    });

    const resolution = await limited.resolveForUser('user-1', request);

    expect(resolution?.provider).not.toBeInstanceOf(FailoverLLMProvider);
  });
});

describe('tier routing (JEF-448)', () => {
  const trakwyn = { aiSource: 'trakwyn', hasKey: false } as const;

  it.each([
    ['free', AI_FEATURE.COVER_LETTER, 'lite'],
    ['free', AI_FEATURE.RESUME, 'lite'],
    ['pro', AI_FEATURE.COVER_LETTER, 'mid'],
    ['pro', AI_FEATURE.RESUME, 'mid'],
    ['pro', AI_FEATURE.CHAT, 'lite'],
    ['pro', AI_FEATURE.PARSE_JOB_DESCRIPTION, 'lite'],
  ] as const)('%s plan, %s -> %s', async (plan, feature, tier) => {
    const { limited, platformFactory } = build({ ...trakwyn, plan });

    const resolution = await limited.resolveForUser('user-1', { feature });

    expect(platformFactory.legs).toHaveBeenCalledWith(tier);
    expect(resolution).toMatchObject({ tier, plan });
  });

  it('pins to the requested tier over the plan default', async () => {
    const { inner, platformFactory } = build({ ...trakwyn, plan: 'pro' });

    await inner.resolveForUser('user-1', { feature: AI_FEATURE.RESUME, tier: 'lite' });

    expect(platformFactory.legs).toHaveBeenCalledWith('lite');
  });

  it('reads an expired Pro plan as free', async () => {
    const { inner, platformFactory } = build({ ...trakwyn, plan: 'pro' });
    const user = makeUser({
      aiSource: 'trakwyn',
      plan: 'pro',
      planExpiresAt: new Date('2020-01-01T00:00:00Z'),
    });

    await inner.resolveForUser('user-1', { feature: AI_FEATURE.RESUME }, { user });

    expect(platformFactory.legs).toHaveBeenCalledWith('lite');
  });

  it('has no tier or plan on an own key', async () => {
    const { limited } = build({ aiSource: 'own', hasKey: true, plan: 'pro' });

    const resolution = await limited.resolveForUser('user-1', request);

    expect(resolution?.tier).toBeUndefined();
    expect(resolution?.plan).toBeUndefined();
  });
});
