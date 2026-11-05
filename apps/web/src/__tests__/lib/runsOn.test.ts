import { describe, it, expect, vi } from 'vitest';

vi.mock('#/graphql/client', () => ({ gqlClient: { request: vi.fn() } }));

import {
  conversationRunsOn,
  newConversationRunsOn,
  providerForNewConversation,
} from '#/routes/_authenticated/assistant/-runsOn';

const keys = (...providers: string[]) => providers.map((provider) => ({ provider }) as never);
const settings = (providers: string[], defaultLlmProvider: string | null) => ({
  llmApiKeys: keys(...providers),
  me: { defaultLlmProvider },
});

const locked = { llmProvider: 'openai', llmModel: 'gpt-4o' };

describe('conversationRunsOn', () => {
  it('reports Trakwyn AI, whatever key the conversation is locked to', () => {
    expect(conversationRunsOn(locked, { aiSource: 'trakwyn', hostedAi: true })).toEqual({
      kind: 'trakwyn',
    });
  });

  it('reports Trakwyn AI for a conversation with no stored provider too', () => {
    expect(
      conversationRunsOn({ llmProvider: null }, { aiSource: 'trakwyn', hostedAi: true }),
    ).toEqual({ kind: 'trakwyn' });
  });

  it.each(['auto', 'own'])('reports the stored key and model under the %s source', (aiSource) => {
    expect(conversationRunsOn(locked, { aiSource, hostedAi: true })).toEqual({
      kind: 'key',
      provider: 'openai',
      model: 'gpt-4o',
    });
  });

  it('reports the stored key when the plan has no hosted AI, so Trakwyn AI cannot be answering', () => {
    expect(conversationRunsOn(locked, { aiSource: 'trakwyn', hostedAi: false })).toEqual({
      kind: 'key',
      provider: 'openai',
      model: 'gpt-4o',
    });
  });

  it('reports the stored key when the settings never loaded', () => {
    expect(conversationRunsOn(locked, { aiSource: undefined, hostedAi: true })).toMatchObject({
      kind: 'key',
    });
  });

  it('does not guess while a Trakwyn AI user’s plan is loading', () => {
    expect(conversationRunsOn(locked, { aiSource: 'trakwyn', hostedAi: null })).toBeNull();
  });

  it('reports nothing for a conversation with no stored provider off Trakwyn AI', () => {
    expect(
      conversationRunsOn({ llmProvider: null }, { aiSource: 'own', hostedAi: true }),
    ).toBeNull();
  });

  it('treats a missing model as none', () => {
    expect(
      conversationRunsOn({ llmProvider: 'openai' }, { aiSource: 'own', hostedAi: true }),
    ).toEqual({
      kind: 'key',
      provider: 'openai',
      model: null,
    });
  });
});

describe('newConversationRunsOn', () => {
  it('reports Trakwyn AI under the Trakwyn AI source', () => {
    expect(
      newConversationRunsOn(settings(['openai'], 'openai'), {
        aiSource: 'trakwyn',
        hostedAi: true,
      }),
    ).toEqual({ kind: 'trakwyn' });
  });

  it('reports the default key', () => {
    expect(
      newConversationRunsOn(settings(['anthropic', 'openai'], 'openai'), {
        aiSource: 'own',
        hostedAi: true,
      }),
    ).toEqual({ kind: 'key', provider: 'openai', model: null });
  });

  it('reports the first key when the default was deleted', () => {
    expect(
      newConversationRunsOn(settings(['anthropic'], null), { aiSource: 'auto', hostedAi: true }),
    ).toEqual({ kind: 'key', provider: 'anthropic', model: null });
  });

  it('reports nothing without a key', () => {
    expect(
      newConversationRunsOn(settings([], null), { aiSource: 'auto', hostedAi: true }),
    ).toBeNull();
  });

  it('reports nothing before the settings load', () => {
    expect(newConversationRunsOn(undefined, { aiSource: undefined, hostedAi: true })).toBeNull();
  });
});

describe('providerForNewConversation', () => {
  it('names none under the Trakwyn AI source, which the API would ignore', () => {
    expect(
      providerForNewConversation(settings(['openai'], 'openai'), {
        aiSource: 'trakwyn',
        hostedAi: true,
      }),
    ).toBeNull();
  });

  it('names the default key otherwise', () => {
    expect(
      providerForNewConversation(settings(['anthropic', 'openai'], 'openai'), {
        aiSource: 'auto',
        hostedAi: true,
      }),
    ).toBe('openai');
  });

  it('names the first key when the default was deleted, so the API still finds one', () => {
    expect(
      providerForNewConversation(settings(['anthropic'], null), {
        aiSource: 'own',
        hostedAi: true,
      }),
    ).toBe('anthropic');
  });

  it('names none without a key', () => {
    expect(
      providerForNewConversation(settings([], null), { aiSource: 'auto', hostedAi: true }),
    ).toBeNull();
  });
});
