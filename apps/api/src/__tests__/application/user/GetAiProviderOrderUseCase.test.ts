import { describe, it, expect, vi } from 'vitest';
import { GetAiProviderOrderUseCase } from '#src/use-cases/user/GetAiProviderOrderUseCase.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { makeLlmApiKey, makeLlmApiKeyRepository } from '#src/__tests__/helpers/mocks/llm.js';
import type { User } from '#src/domain/user/User.js';

const NOW = new Date('2026-11-05T12:00:00Z');

const build = (
  user: User | null,
  keys: Array<{ provider: string; createdAt?: Date }>,
  hostedAiOn = true,
) => {
  const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
  const llmApiKeyRepository = makeLlmApiKeyRepository({
    findAllByUserId: vi
      .fn()
      .mockResolvedValue(
        keys.map(({ provider, createdAt }) =>
          makeLlmApiKey({ provider, createdAt: createdAt ?? NOW }),
        ),
      ),
  });
  return new GetAiProviderOrderUseCase({
    userRepository,
    llmApiKeyRepository,
    platformLlmProviderFactory: {
      isEnabled: () => hostedAiOn,
      isEnabledFor: () => hostedAiOn,
      legs: () => [],
    },
    now: () => NOW,
  });
};

const pro = { plan: 'pro' as const, planExpiresAt: null };

describe('GetAiProviderOrderUseCase', () => {
  it('returns nothing for a user that does not exist', async () => {
    expect(await build(null, []).execute('missing')).toEqual([]);
  });

  it('returns a saved order as stored', async () => {
    const user = makeUser({ ...pro, aiProviderOrder: ['anthropic', 'trakwyn', 'openai'] });

    const order = await build(user, [{ provider: 'openai' }, { provider: 'anthropic' }]).execute(
      'user-1',
    );

    expect(order).toEqual(['anthropic', 'trakwyn', 'openai']);
  });

  it('drops a saved entry whose key no longer exists, so the page never promises it', async () => {
    const user = makeUser({ aiProviderOrder: ['openai', 'anthropic'] });

    expect(await build(user, [{ provider: 'anthropic' }]).execute('user-1')).toEqual(['anthropic']);
  });

  it('drops Trakwyn AI from a saved order when hosted AI is no longer on for the user', async () => {
    const user = makeUser({ aiProviderOrder: ['trakwyn', 'openai'] });

    const order = await build(user, [{ provider: 'openai' }], false).execute('user-1');

    expect(order).toEqual(['openai']);
  });

  it('derives the order from the older settings when none was saved', async () => {
    const user = makeUser({
      aiSource: 'own',
      defaultLlmProvider: 'anthropic',
      llmFallbackWhenLimited: true,
    });

    const order = await build(user, [
      { provider: 'openai', createdAt: new Date('2026-01-01') },
      { provider: 'anthropic', createdAt: new Date('2026-02-01') },
    ]).execute('user-1');

    expect(order).toEqual(['anthropic', 'openai']);
  });

  it('offers a paid user with no key Trakwyn AI under auto', async () => {
    const user = makeUser({ ...pro, aiSource: 'auto' });

    expect(await build(user, []).execute('user-1')).toEqual(['trakwyn']);
  });

  it('offers a free user with no key nothing under auto, as before hosted AI', async () => {
    const user = makeUser({ plan: 'free', planExpiresAt: null, aiSource: 'auto' });

    expect(await build(user, []).execute('user-1')).toEqual([]);
  });
});
