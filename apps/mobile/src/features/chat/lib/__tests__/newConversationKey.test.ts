import { keyForNewConversation } from '../newConversationKey';
import type { AiCredits, LlmApiKey } from '../../../settings/types';

const key = (provider: string): LlmApiKey => ({
  provider,
  model: `${provider}-model`,
  baseUrl: null,
  monthlyTokenLimit: null,
});

const pro: AiCredits = {
  used: 0,
  limit: 300,
  bonusRemaining: 0,
  resetsAt: '2026-12-01T00:00:00.000Z',
};
const free: AiCredits = {
  used: 0,
  limit: 0,
  bonusRemaining: 0,
  resetsAt: '2026-12-01T00:00:00.000Z',
};

describe('keyForNewConversation', () => {
  it('returns the default key', () => {
    expect(
      keyForNewConversation({
        keys: [key('anthropic'), key('openai')],
        defaultProvider: 'openai',
        aiSource: 'own',
        aiCredits: pro,
      }),
    ).toEqual(key('openai'));
  });

  it('returns the first key when the default was deleted while others remain', () => {
    expect(
      keyForNewConversation({
        keys: [key('anthropic')],
        defaultProvider: null,
        aiSource: 'auto',
        aiCredits: free,
      }),
    ).toEqual(key('anthropic'));
  });

  it('returns the first key when the default no longer matches a saved one', () => {
    expect(
      keyForNewConversation({
        keys: [key('anthropic')],
        defaultProvider: 'openai',
        aiSource: 'auto',
        aiCredits: free,
      }),
    ).toEqual(key('anthropic'));
  });

  it('returns no key under the Trakwyn AI source, which the API would ignore', () => {
    expect(
      keyForNewConversation({
        keys: [key('openai')],
        defaultProvider: 'openai',
        aiSource: 'trakwyn',
        aiCredits: pro,
      }),
    ).toBeNull();
  });

  it('still returns the default key under the Trakwyn AI source when the plan has no hosted AI', () => {
    expect(
      keyForNewConversation({
        keys: [key('openai')],
        defaultProvider: 'openai',
        aiSource: 'trakwyn',
        aiCredits: free,
      }),
    ).toEqual(key('openai'));
  });

  it('prefers the own key under auto, as the API does', () => {
    expect(
      keyForNewConversation({
        keys: [key('openai')],
        defaultProvider: 'openai',
        aiSource: 'auto',
        aiCredits: pro,
      }),
    ).toEqual(key('openai'));
  });

  it('returns no key when there is none', () => {
    expect(
      keyForNewConversation({ keys: [], defaultProvider: null, aiSource: 'auto', aiCredits: pro }),
    ).toBeNull();
  });
});
