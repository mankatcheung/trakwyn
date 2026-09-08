import { describe, it, expect, vi } from 'vitest';
import { UserLLMProviderFactory } from '#src/infrastructure/llm/UserLLMProviderFactory.js';
import { OpenAICompatibleLLMProvider } from '#src/infrastructure/llm/OpenAICompatibleLLMProvider.js';
import { AnthropicLLMProvider } from '#src/infrastructure/llm/AnthropicLLMProvider.js';
import { GoogleAILLMProvider } from '#src/infrastructure/llm/GoogleAILLMProvider.js';
import { LLM_PROVIDER } from '#src/use-cases/constants.js';
import {
  makeLlmApiKey,
  makeLlmApiKeyCipher,
  makeLlmApiKeyRepository,
  makeLlmUsageEventRepository,
} from '#src/__tests__/helpers/mocks/llm.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { makeOutboundUrlPolicy } from '#src/__tests__/helpers/mocks/infrastructure.js';

describe('UserLLMProviderFactory', () => {
  it('returns null when no provider is given and the user has no default configured', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ defaultLlmProvider: null })),
    });
    const factory = new UserLLMProviderFactory({
      userRepository,
      llmApiKeyRepository: makeLlmApiKeyRepository(),
      llmApiKeyCipher: makeLlmApiKeyCipher(),
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      llmUsageEventRepository: makeLlmUsageEventRepository(),
      generateId: () => 'evt-id',
    });

    expect(await factory.forUser('user-1')).toBeNull();
  });

  it('returns null when the user does not exist and no provider is given', async () => {
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });
    const factory = new UserLLMProviderFactory({
      userRepository,
      llmApiKeyRepository: makeLlmApiKeyRepository(),
      llmApiKeyCipher: makeLlmApiKeyCipher(),
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      llmUsageEventRepository: makeLlmUsageEventRepository(),
      generateId: () => 'evt-id',
    });

    expect(await factory.forUser('missing')).toBeNull();
  });

  it('returns null when no LlmApiKey row exists for the resolved provider', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ defaultLlmProvider: LLM_PROVIDER.OPENAI })),
    });
    const llmApiKeyRepository = makeLlmApiKeyRepository({
      findByUserIdAndProvider: vi.fn().mockResolvedValue(null),
    });
    const factory = new UserLLMProviderFactory({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher: makeLlmApiKeyCipher(),
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      llmUsageEventRepository: makeLlmUsageEventRepository(),
      generateId: () => 'evt-id',
    });

    expect(await factory.forUser('user-1')).toBeNull();
  });

  it('returns null when the stored provider is not in the registry', async () => {
    const llmApiKeyRepository = makeLlmApiKeyRepository({
      findByUserIdAndProvider: vi
        .fn()
        .mockResolvedValue(makeLlmApiKey({ provider: 'not-a-real-provider' })),
    });
    const factory = new UserLLMProviderFactory({
      userRepository: makeUserRepository(),
      llmApiKeyRepository,
      llmApiKeyCipher: makeLlmApiKeyCipher(),
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      llmUsageEventRepository: makeLlmUsageEventRepository(),
      generateId: () => 'evt-id',
    });

    expect(await factory.forUser('user-1', 'not-a-real-provider')).toBeNull();
  });

  it('resolves the default provider when none is passed explicitly', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser({ defaultLlmProvider: LLM_PROVIDER.ANTHROPIC })),
    });
    const llmApiKeyRepository = makeLlmApiKeyRepository({
      findByUserIdAndProvider: vi
        .fn()
        .mockResolvedValue(makeLlmApiKey({ provider: LLM_PROVIDER.ANTHROPIC })),
    });
    const factory = new UserLLMProviderFactory({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher: makeLlmApiKeyCipher(),
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      llmUsageEventRepository: makeLlmUsageEventRepository(),
      generateId: () => 'evt-id',
    });

    const provider = await factory.forUser('user-1', undefined, undefined, false);

    expect(llmApiKeyRepository.findByUserIdAndProvider).toHaveBeenCalledWith(
      'user-1',
      LLM_PROVIDER.ANTHROPIC,
    );
    expect(provider).toBeInstanceOf(AnthropicLLMProvider);
  });

  it('uses the explicitly passed provider without consulting the user default', async () => {
    const userRepository = makeUserRepository();
    const llmApiKeyRepository = makeLlmApiKeyRepository({
      findByUserIdAndProvider: vi
        .fn()
        .mockResolvedValue(
          makeLlmApiKey({ provider: LLM_PROVIDER.OPENAI, apiKey: 'encrypted:my-key' }),
        ),
    });
    const llmApiKeyCipher = makeLlmApiKeyCipher();
    const factory = new UserLLMProviderFactory({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher,
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      llmUsageEventRepository: makeLlmUsageEventRepository(),
      generateId: () => 'evt-id',
    });

    const provider = await factory.forUser('user-1', LLM_PROVIDER.OPENAI, undefined, false);

    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(provider).toBeInstanceOf(OpenAICompatibleLLMProvider);
    expect(llmApiKeyCipher.decrypt).toHaveBeenCalledWith('encrypted:my-key', 'user-1:openai');
  });

  it('returns an OpenAICompatibleLLMProvider for openrouter', async () => {
    const llmApiKeyRepository = makeLlmApiKeyRepository({
      findByUserIdAndProvider: vi
        .fn()
        .mockResolvedValue(makeLlmApiKey({ provider: LLM_PROVIDER.OPENROUTER })),
    });
    const factory = new UserLLMProviderFactory({
      userRepository: makeUserRepository(),
      llmApiKeyRepository,
      llmApiKeyCipher: makeLlmApiKeyCipher(),
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      llmUsageEventRepository: makeLlmUsageEventRepository(),
      generateId: () => 'evt-id',
    });

    expect(
      await factory.forUser('user-1', LLM_PROVIDER.OPENROUTER, undefined, false),
    ).toBeInstanceOf(OpenAICompatibleLLMProvider);
  });

  it('returns a GoogleAILLMProvider for the googleai provider', async () => {
    const llmApiKeyRepository = makeLlmApiKeyRepository({
      findByUserIdAndProvider: vi
        .fn()
        .mockResolvedValue(makeLlmApiKey({ provider: LLM_PROVIDER.GOOGLEAI })),
    });
    const factory = new UserLLMProviderFactory({
      userRepository: makeUserRepository(),
      llmApiKeyRepository,
      llmApiKeyCipher: makeLlmApiKeyCipher(),
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      llmUsageEventRepository: makeLlmUsageEventRepository(),
      generateId: () => 'evt-id',
    });

    expect(await factory.forUser('user-1', LLM_PROVIDER.GOOGLEAI, undefined, false)).toBeInstanceOf(
      GoogleAILLMProvider,
    );
  });

  it('builds an OpenAICompatibleLLMProvider from the stored baseUrl/model for the custom provider', async () => {
    const llmApiKeyRepository = makeLlmApiKeyRepository({
      findByUserIdAndProvider: vi.fn().mockResolvedValue(
        makeLlmApiKey({
          provider: LLM_PROVIDER.CUSTOM,
          baseUrl: 'https://my-llm.example.com/v1/chat/completions',
          model: 'my-custom-model',
        }),
      ),
    });
    const factory = new UserLLMProviderFactory({
      userRepository: makeUserRepository(),
      llmApiKeyRepository,
      llmApiKeyCipher: makeLlmApiKeyCipher(),
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      llmUsageEventRepository: makeLlmUsageEventRepository(),
      generateId: () => 'evt-id',
    });

    expect(await factory.forUser('user-1', LLM_PROVIDER.CUSTOM, undefined, false)).toBeInstanceOf(
      OpenAICompatibleLLMProvider,
    );
  });

  it('overrides the stored model when an explicit model is passed', async () => {
    const llmApiKeyRepository = makeLlmApiKeyRepository({
      findByUserIdAndProvider: vi
        .fn()
        .mockResolvedValue(makeLlmApiKey({ provider: LLM_PROVIDER.OPENAI, model: 'gpt-4o' })),
    });
    const factory = new UserLLMProviderFactory({
      userRepository: makeUserRepository(),
      llmApiKeyRepository,
      llmApiKeyCipher: makeLlmApiKeyCipher(),
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      llmUsageEventRepository: makeLlmUsageEventRepository(),
      generateId: () => 'evt-id',
    });

    const provider = await factory.forUser('user-1', LLM_PROVIDER.OPENAI, 'gpt-4o-mini', false);

    expect((provider as unknown as { model: string }).model).toBe('gpt-4o-mini');
  });

  describe('usage tracking (JEF-250)', () => {
    it('wraps the resolved provider so it records usage after a call, by default', async () => {
      const llmApiKeyRepository = makeLlmApiKeyRepository({
        findByUserIdAndProvider: vi
          .fn()
          .mockResolvedValue(makeLlmApiKey({ provider: LLM_PROVIDER.OPENAI })),
      });
      const llmUsageEventRepository = makeLlmUsageEventRepository();
      const factory = new UserLLMProviderFactory({
        userRepository: makeUserRepository(),
        llmApiKeyRepository,
        llmApiKeyCipher: makeLlmApiKeyCipher(),
        outboundUrlPolicy: makeOutboundUrlPolicy(),
        llmUsageEventRepository,
        generateId: () => 'evt-id',
      });

      const provider = await factory.forUser('user-1', LLM_PROVIDER.OPENAI);
      expect(provider).not.toBeInstanceOf(OpenAICompatibleLLMProvider);
    });

    it('returns the raw provider, unwrapped, when trackUsage is false', async () => {
      const llmApiKeyRepository = makeLlmApiKeyRepository({
        findByUserIdAndProvider: vi
          .fn()
          .mockResolvedValue(makeLlmApiKey({ provider: LLM_PROVIDER.OPENAI })),
      });
      const factory = new UserLLMProviderFactory({
        userRepository: makeUserRepository(),
        llmApiKeyRepository,
        llmApiKeyCipher: makeLlmApiKeyCipher(),
        outboundUrlPolicy: makeOutboundUrlPolicy(),
        llmUsageEventRepository: makeLlmUsageEventRepository(),
        generateId: () => 'evt-id',
      });

      const provider = await factory.forUser('user-1', LLM_PROVIDER.OPENAI, undefined, false);
      expect(provider).toBeInstanceOf(OpenAICompatibleLLMProvider);
    });
  });

  describe('hints (F9)', () => {
    it('skips the user and key lookups when both are hinted', async () => {
      const userRepository = makeUserRepository();
      const llmApiKeyRepository = makeLlmApiKeyRepository();
      const factory = new UserLLMProviderFactory({
        userRepository,
        llmApiKeyRepository,
        llmApiKeyCipher: makeLlmApiKeyCipher(),
        outboundUrlPolicy: makeOutboundUrlPolicy(),
        llmUsageEventRepository: makeLlmUsageEventRepository(),
        generateId: () => 'evt-id',
      });
      const hintedKey = makeLlmApiKey({ provider: LLM_PROVIDER.OPENAI, apiKey: 'encrypted:k' });

      const resolution = await factory.resolveForUser('user-1', undefined, null, true, {
        user: makeUser({ defaultLlmProvider: LLM_PROVIDER.OPENAI }),
        key: hintedKey,
      });

      expect(resolution?.providerId).toBe(LLM_PROVIDER.OPENAI);
      expect(userRepository.findById).not.toHaveBeenCalled();
      expect(llmApiKeyRepository.findByUserIdAndProvider).not.toHaveBeenCalled();
    });

    it('ignores a hinted key for a different provider and looks the right one up', async () => {
      const llmApiKeyRepository = makeLlmApiKeyRepository({
        findByUserIdAndProvider: vi
          .fn()
          .mockResolvedValue(makeLlmApiKey({ provider: LLM_PROVIDER.ANTHROPIC })),
      });
      const factory = new UserLLMProviderFactory({
        userRepository: makeUserRepository(),
        llmApiKeyRepository,
        llmApiKeyCipher: makeLlmApiKeyCipher(),
        outboundUrlPolicy: makeOutboundUrlPolicy(),
        llmUsageEventRepository: makeLlmUsageEventRepository(),
        generateId: () => 'evt-id',
      });

      const resolution = await factory.resolveForUser(
        'user-1',
        LLM_PROVIDER.ANTHROPIC,
        null,
        true,
        {
          key: makeLlmApiKey({ provider: LLM_PROVIDER.OPENAI }),
        },
      );

      expect(resolution?.providerId).toBe(LLM_PROVIDER.ANTHROPIC);
      expect(llmApiKeyRepository.findByUserIdAndProvider).toHaveBeenCalledWith(
        'user-1',
        LLM_PROVIDER.ANTHROPIC,
      );
    });
  });
});
