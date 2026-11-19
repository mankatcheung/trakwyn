import { describe, it, expect, vi } from 'vitest';
import { SaveLlmApiKeyUseCase } from '#src/use-cases/user/SaveLlmApiKeyUseCase.js';
import { makeLlmApiKeyCipher, makeLlmApiKeyRepository } from '#src/__tests__/helpers/mocks/llm.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import { makeOutboundUrlPolicy } from '#src/__tests__/helpers/mocks/infrastructure.js';

const generateId = () => 'llm-key-1';

describe('SaveLlmApiKeyUseCase', () => {
  it('throws VALIDATION for an unsupported provider', async () => {
    const userRepository = makeUserRepository();
    const llmApiKeyRepository = makeLlmApiKeyRepository();
    const llmApiKeyCipher = makeLlmApiKeyCipher();

    const err = await new SaveLlmApiKeyUseCase({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher,
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      generateId,
    })
      .execute({ userId: 'user-1', provider: 'not-a-provider', apiKey: 'sk-123' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
  });

  it('throws VALIDATION for a blank API key', async () => {
    const userRepository = makeUserRepository();
    const llmApiKeyRepository = makeLlmApiKeyRepository();
    const llmApiKeyCipher = makeLlmApiKeyCipher();

    const err = await new SaveLlmApiKeyUseCase({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher,
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      generateId,
    })
      .execute({ userId: 'user-1', provider: 'openrouter', apiKey: '   ' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
  });

  it('throws NOT_FOUND when the user does not exist', async () => {
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });
    const llmApiKeyRepository = makeLlmApiKeyRepository();
    const llmApiKeyCipher = makeLlmApiKeyCipher();

    const err = await new SaveLlmApiKeyUseCase({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher,
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      generateId,
    })
      .execute({ userId: 'missing', provider: 'openrouter', apiKey: 'sk-123' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('encrypts the key and upserts it under the chosen provider', async () => {
    const user = makeUser();
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(user),
    });
    const llmApiKeyRepository = makeLlmApiKeyRepository();
    const llmApiKeyCipher = makeLlmApiKeyCipher();

    await new SaveLlmApiKeyUseCase({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher,
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      generateId,
    }).execute({
      userId: 'user-1',
      provider: 'googleai',
      apiKey: 'sk-123',
    });

    // Sealed to its own row: the same ciphertext in another user's row must not decrypt.
    expect(llmApiKeyCipher.encrypt).toHaveBeenCalledWith(
      'sk-123',
      expect.stringMatching(/^user-1:/),
    );
    expect(llmApiKeyRepository.upsert).toHaveBeenCalledWith({
      id: 'llm-key-1',
      userId: 'user-1',
      provider: 'googleai',
      apiKey: 'encrypted:sk-123',
      model: null,
      baseUrl: null,
    });
  });

  it('makes the first-ever configured provider the default', async () => {
    const user = makeUser({ defaultLlmProvider: null });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(user),
    });
    const llmApiKeyRepository = makeLlmApiKeyRepository();
    const llmApiKeyCipher = makeLlmApiKeyCipher();

    await new SaveLlmApiKeyUseCase({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher,
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      generateId,
    }).execute({
      userId: 'user-1',
      provider: 'googleai',
      apiKey: 'sk-123',
    });

    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      defaultLlmProvider: 'googleai',
    });
  });

  it('does not change the default when the user already has one', async () => {
    const user = makeUser({ defaultLlmProvider: 'openai' });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(user),
    });
    const llmApiKeyRepository = makeLlmApiKeyRepository();
    const llmApiKeyCipher = makeLlmApiKeyCipher();

    await new SaveLlmApiKeyUseCase({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher,
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      generateId,
    }).execute({
      userId: 'user-1',
      provider: 'googleai',
      apiKey: 'sk-123',
    });

    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('persists an optional model override for a named provider', async () => {
    const user = makeUser();
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(user),
    });
    const llmApiKeyRepository = makeLlmApiKeyRepository();
    const llmApiKeyCipher = makeLlmApiKeyCipher();

    await new SaveLlmApiKeyUseCase({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher,
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      generateId,
    }).execute({
      userId: 'user-1',
      provider: 'openai',
      apiKey: 'sk-123',
      model: 'gpt-4o',
    });

    expect(llmApiKeyRepository.upsert).toHaveBeenCalledWith({
      id: 'llm-key-1',
      userId: 'user-1',
      provider: 'openai',
      apiKey: 'encrypted:sk-123',
      model: 'gpt-4o',
      baseUrl: null,
    });
  });

  it('throws VALIDATION when a baseUrl is given for a named (non-custom) provider', async () => {
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(makeUser()),
    });
    const llmApiKeyRepository = makeLlmApiKeyRepository();
    const llmApiKeyCipher = makeLlmApiKeyCipher();

    const err = await new SaveLlmApiKeyUseCase({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher,
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      generateId,
    })
      .execute({
        userId: 'user-1',
        provider: 'openai',
        apiKey: 'sk-123',
        baseUrl: 'https://example.com',
      })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
  });

  it('throws VALIDATION when the custom provider is missing a base URL', async () => {
    const userRepository = makeUserRepository();
    const llmApiKeyRepository = makeLlmApiKeyRepository();
    const llmApiKeyCipher = makeLlmApiKeyCipher();

    const err = await new SaveLlmApiKeyUseCase({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher,
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      generateId,
    })
      .execute({ userId: 'user-1', provider: 'custom', apiKey: 'sk-123', model: 'some-model' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect((err as Error).message).toMatch(/base URL is required/);
  });

  it('throws VALIDATION when the custom provider base URL is malformed', async () => {
    const userRepository = makeUserRepository();
    const llmApiKeyRepository = makeLlmApiKeyRepository();
    const llmApiKeyCipher = makeLlmApiKeyCipher();

    const err = await new SaveLlmApiKeyUseCase({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher,
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      generateId,
    })
      .execute({
        userId: 'user-1',
        provider: 'custom',
        apiKey: 'sk-123',
        model: 'some-model',
        baseUrl: 'not-a-url',
      })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect((err as Error).message).toMatch(/valid http/);
  });

  it('throws VALIDATION when the custom provider is missing a model', async () => {
    const userRepository = makeUserRepository();
    const llmApiKeyRepository = makeLlmApiKeyRepository();
    const llmApiKeyCipher = makeLlmApiKeyCipher();

    const err = await new SaveLlmApiKeyUseCase({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher,
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      generateId,
    })
      .execute({
        userId: 'user-1',
        provider: 'custom',
        apiKey: 'sk-123',
        baseUrl: 'https://my-llm.example.com/v1/chat/completions',
      })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect((err as Error).message).toMatch(/model is required/);
  });

  it('persists baseUrl and model for a valid custom provider', async () => {
    const user = makeUser();
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(user),
    });
    const llmApiKeyRepository = makeLlmApiKeyRepository();
    const llmApiKeyCipher = makeLlmApiKeyCipher();

    await new SaveLlmApiKeyUseCase({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher,
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      generateId,
    }).execute({
      userId: 'user-1',
      provider: 'custom',
      apiKey: 'sk-123',
      model: 'my-model',
      baseUrl: 'https://my-llm.example.com/v1/chat/completions',
    });

    expect(llmApiKeyRepository.upsert).toHaveBeenCalledWith({
      id: 'llm-key-1',
      userId: 'user-1',
      provider: 'custom',
      apiKey: 'encrypted:sk-123',
      model: 'my-model',
      baseUrl: 'https://my-llm.example.com/v1/chat/completions',
    });
  });
  it('asks the outbound policy about a custom base URL and refuses what it refuses', async () => {
    const userRepository = makeUserRepository();
    const llmApiKeyRepository = makeLlmApiKeyRepository();
    const llmApiKeyCipher = makeLlmApiKeyCipher();
    const outboundUrlPolicy = makeOutboundUrlPolicy({
      assertAllowed: vi.fn().mockRejectedValue(new ValidationError('URL host is not allowed')),
    });

    const err = await new SaveLlmApiKeyUseCase({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher,
      outboundUrlPolicy,
      generateId,
    })
      .execute({
        userId: 'user-1',
        provider: 'custom',
        apiKey: 'sk-123',
        baseUrl: 'http://localhost:6379/',
        model: 'llama',
      })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(outboundUrlPolicy.assertAllowed).toHaveBeenCalledWith(
      'http://localhost:6379/',
      'llm-provider',
    );
    expect(llmApiKeyRepository.upsert).not.toHaveBeenCalled();
  });

  it('does not consult the outbound policy for a named provider, whose endpoint is fixed', async () => {
    const user = makeUser({ id: 'user-1', defaultLlmProvider: 'openai' });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(user),
    });
    const llmApiKeyRepository = makeLlmApiKeyRepository();
    const llmApiKeyCipher = makeLlmApiKeyCipher();
    const outboundUrlPolicy = makeOutboundUrlPolicy();

    await new SaveLlmApiKeyUseCase({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher,
      outboundUrlPolicy,
      generateId,
    }).execute({ userId: 'user-1', provider: 'openai', apiKey: 'sk-123' });

    expect(outboundUrlPolicy.assertAllowed).not.toHaveBeenCalled();
  });
  it('refuses a model id with path or query characters', async () => {
    const user = makeUser({ id: 'user-1' });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    const llmApiKeyRepository = makeLlmApiKeyRepository();

    const err = await new SaveLlmApiKeyUseCase({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher: makeLlmApiKeyCipher(),
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      generateId,
    })
      .execute({ userId: 'user-1', provider: 'googleai', apiKey: 'k', model: '../other:predict?x' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(llmApiKeyRepository.upsert).not.toHaveBeenCalled();
  });

  it('accepts the model ids providers actually use', async () => {
    const user = makeUser({ id: 'user-1', defaultLlmProvider: 'openai' });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(user),
    });
    const llmApiKeyRepository = makeLlmApiKeyRepository();
    const useCase = new SaveLlmApiKeyUseCase({
      userRepository,
      llmApiKeyRepository,
      llmApiKeyCipher: makeLlmApiKeyCipher(),
      outboundUrlPolicy: makeOutboundUrlPolicy(),
      generateId,
    });

    for (const model of [
      'gpt-4o-mini',
      'claude-haiku-4-5',
      'openai/gpt-4o-mini',
      'models/gemini-2.5-flash',
      'llama3.1:8b',
    ]) {
      await expect(
        useCase.execute({ userId: 'user-1', provider: 'openrouter', apiKey: 'k', model }),
      ).resolves.toBeUndefined();
    }
  });
});
