import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserLLMProviderFactory } from '#src/infrastructure/llm/UserLLMProviderFactory.js';
import { LimitEnforcingLLMProviderFactory } from '#src/infrastructure/llm/LimitEnforcingLLMProviderFactory.js';
import { FailoverLLMProvider } from '#src/infrastructure/llm/FailoverLLMProvider.js';
import { HostedAiCircuits } from '#src/infrastructure/llm/HostedAiCircuits.js';
import { AI_FEATURE, LLM_PROVIDER } from '#src/use-cases/constants.js';
import {
  AiTemporarilyUnavailableError,
  LlmProviderError,
} from '#src/use-cases/errors/DomainError.js';
import type { IPlatformLLMProviderFactory } from '#src/use-cases/ports/IPlatformLLMProviderFactory.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import {
  makeLlmApiKey,
  makeLlmApiKeyCipher,
  makeLlmApiKeyRepository,
  makeLlmUsageEventRepository,
} from '#src/__tests__/helpers/mocks/llm.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { makeAiCreditService } from '#src/__tests__/helpers/mocks/plans.js';
import { makeLogger, makeOutboundUrlPolicy } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeFakeMetrics } from '#src/__tests__/helpers/fakeMetrics.js';

const usage = { promptTokens: 10, completionTokens: 5 };
const MODEL_A = '@cf/test/model-a';
const MODEL_B = '@cf/test/model-b';
const down = () => new LlmProviderError('unavailable', { provider: 'workersai', status: 503 });

/** A model that answers, until a test calls `breakIt()`. */
function model(name: string) {
  let broken = false;
  const complete = vi.fn(async () => {
    if (broken) throw down();
    return { content: `from ${name}`, usage };
  });
  const provider: ILLMProvider = { complete, completeWithToolsStream: vi.fn() };
  return {
    provider,
    complete,
    breakIt: () => {
      broken = true;
    },
    fixIt: () => {
      broken = false;
    },
  };
}

function build(opts: { aiProviderOrder?: string[]; hasKey?: boolean } = {}) {
  const a = model('a');
  const b = model('b');
  const platformFactory: IPlatformLLMProviderFactory = {
    isEnabled: () => true,
    isEnabledFor: () => true,
    legs: vi.fn(() => [
      { providerId: 'workersai', model: MODEL_A, provider: a.provider },
      { providerId: 'workersai', model: MODEL_B, provider: b.provider },
    ]),
  };
  const user = makeUser({
    aiSource: 'trakwyn',
    aiProviderOrder: opts.aiProviderOrder ?? null,
    emailVerifiedAt: new Date('2026-01-01'),
    plan: 'pro',
    planExpiresAt: null,
  });
  const key = makeLlmApiKey({ provider: LLM_PROVIDER.OPENAI });
  const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
  const llmApiKeyRepository = makeLlmApiKeyRepository({
    findByUserIdAndProvider: vi.fn().mockResolvedValue(opts.hasKey ? key : null),
    findAllByUserId: vi.fn().mockResolvedValue(opts.hasKey ? [key] : []),
  });
  const llmUsageEventRepository = makeLlmUsageEventRepository();
  const metrics = makeFakeMetrics();
  const circuits = new HostedAiCircuits({
    logger: makeLogger(),
    metrics,
    failureThreshold: 1,
    cooldownMs: 1000,
  });
  const inner = new UserLLMProviderFactory({
    userRepository,
    llmApiKeyRepository,
    llmApiKeyCipher: makeLlmApiKeyCipher(),
    outboundUrlPolicy: makeOutboundUrlPolicy(),
    llmUsageEventRepository,
    logger: makeLogger(),
    generateId: () => 'evt-id',
    platformLlmProviderFactory: platformFactory,
    hostedAiCircuits: circuits,
  });
  const aiCreditService = makeAiCreditService({
    charge: vi.fn(async () => ({ refund: vi.fn() })) as never,
  });
  const limited = new LimitEnforcingLLMProviderFactory({
    userLlmProviderFactory: inner,
    userRepository,
    llmApiKeyRepository,
    llmUsageEventRepository,
    now: () => new Date('2026-11-02T00:00:00Z'),
    platformLlmProviderFactory: platformFactory,
    aiCreditService,
  });
  return { a, b, inner, limited, llmUsageEventRepository, aiCreditService, metrics };
}

const request = { feature: AI_FEATURE.CHAT };

describe('hosted AI circuits in platform resolution (JEF-504)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps both models while they are healthy', async () => {
    const { inner } = build();

    const resolution = await inner.resolveForUser('user-1', request, { via: 'platform' });

    expect(resolution?.provider).toBeInstanceOf(FailoverLLMProvider);
  });

  it('leaves out a model whose circuit is open, so the other one answers at once', async () => {
    const { inner, a, b, llmUsageEventRepository, metrics } = build();
    a.breakIt();
    const first = await inner.resolveForUser('user-1', request, { via: 'platform' });
    await first!.provider.complete([]); // a fails, opens its circuit, b answers
    a.complete.mockClear();
    b.complete.mockClear();

    const second = await inner.resolveForUser('user-1', request, { via: 'platform' });
    const result = await second!.provider.complete([]);

    expect(second?.provider).not.toBeInstanceOf(FailoverLLMProvider); // one leg left
    expect(result.content).toBe('from b');
    expect(a.complete).not.toHaveBeenCalled();
    expect(llmUsageEventRepository.record).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: MODEL_B, source: 'platform' }),
    );
    expect(metrics.hostedCircuitShortCircuits).toContain(MODEL_A);
  });

  it('tries the model again once the cooldown has passed, and closes on success', async () => {
    const { inner, a } = build();
    a.breakIt();
    const first = await inner.resolveForUser('user-1', request, { via: 'platform' });
    await first!.provider.complete([]);

    a.fixIt();
    vi.advanceTimersByTime(1000);
    const resolution = await inner.resolveForUser('user-1', request, { via: 'platform' });
    const result = await resolution!.provider.complete([]);

    expect(resolution?.provider).toBeInstanceOf(FailoverLLMProvider); // a is back in rotation
    expect(result.content).toBe('from a');
  });

  it('refuses with a mapped error, before anything is charged, when every model is open', async () => {
    const { limited, a, b, aiCreditService } = build();
    a.breakIt();
    b.breakIt();
    const first = await limited.resolveForUser('user-1', request);
    await expect(first!.provider.complete([])).rejects.toBeInstanceOf(LlmProviderError);
    vi.mocked(aiCreditService.charge).mockClear();

    await expect(limited.resolveForUser('user-1', request)).rejects.toBeInstanceOf(
      AiTemporarilyUnavailableError,
    );

    expect(aiCreditService.charge).not.toHaveBeenCalled();
  });

  it('moves on to the next listed provider, charging nothing, when every hosted model is open', async () => {
    const { limited, a, b, aiCreditService } = build({
      aiProviderOrder: ['trakwyn', LLM_PROVIDER.OPENAI],
      hasKey: true,
    });
    a.breakIt();
    b.breakIt();
    const first = await limited.resolveForUser('user-1', request);
    await expect(first!.provider.complete([])).rejects.toBeInstanceOf(LlmProviderError);
    vi.mocked(aiCreditService.charge).mockClear();

    const resolution = await limited.resolveForUser('user-1', request);

    expect(resolution?.entry).toBe(LLM_PROVIDER.OPENAI);
    expect(resolution?.source).toBe('byok');
    expect(resolution?.fellBackFrom).toBe('trakwyn');
    expect(aiCreditService.charge).not.toHaveBeenCalled();
  });

  it('records no usage for a call a circuit refused', async () => {
    const { inner, a, b, llmUsageEventRepository } = build();
    a.breakIt();
    b.breakIt();
    // Resolved while both circuits were still closed, called after they opened.
    const resolution = await inner.resolveForUser('user-1', request, { via: 'platform' });
    await expect(resolution!.provider.complete([])).rejects.toBeInstanceOf(LlmProviderError);
    a.complete.mockClear();
    b.complete.mockClear();

    await expect(resolution!.provider.complete([])).rejects.toMatchObject({ kind: 'unavailable' });

    expect(a.complete).not.toHaveBeenCalled(); // no request was made
    expect(b.complete).not.toHaveBeenCalled();
    expect(llmUsageEventRepository.record).not.toHaveBeenCalled();
  });

  it('still reports hosted AI as not configured when the platform has no legs at all', async () => {
    const { inner } = build();
    vi.spyOn(
      (inner as unknown as { deps: { platformLlmProviderFactory: IPlatformLLMProviderFactory } })
        .deps.platformLlmProviderFactory,
      'legs',
    ).mockReturnValue([]);

    await expect(
      inner.resolveForUser('user-1', request, { via: 'platform' }),
    ).rejects.toMatchObject({ name: 'AiNotConfiguredError' });
  });
});
