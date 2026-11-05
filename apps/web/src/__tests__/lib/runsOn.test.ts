import { describe, it, expect, vi } from 'vitest';

vi.mock('#/graphql/client', () => ({ gqlClient: { request: vi.fn() } }));

import {
  conversationRunsOn,
  newConversationRunsOn,
} from '#/routes/_authenticated/assistant/-runsOn';

const startedOnOpenAi = { llmProvider: 'openai', llmModel: 'gpt-4o' };

describe('conversationRunsOn', () => {
  describe('with the user’s provider order known', () => {
    it('reports Trakwyn AI when it leads, whatever key the conversation started on', () => {
      expect(
        conversationRunsOn(startedOnOpenAi, { order: ['trakwyn', 'openai'], hostedAi: true }),
      ).toEqual({ kind: 'trakwyn' });
    });

    it('reports Trakwyn AI for a conversation that never named a key', () => {
      expect(
        conversationRunsOn({ llmProvider: null }, { order: ['trakwyn'], hostedAi: true }),
      ).toEqual({ kind: 'trakwyn' });
    });

    it('reports the key that leads, with the conversation’s model when it started on that key', () => {
      expect(
        conversationRunsOn(startedOnOpenAi, { order: ['openai', 'trakwyn'], hostedAi: true }),
      ).toEqual({ kind: 'key', provider: 'openai', model: 'gpt-4o' });
    });

    it('reports the key that leads, not the one the chat started on, and drops that key’s model', () => {
      expect(
        conversationRunsOn(startedOnOpenAi, { order: ['anthropic', 'openai'], hostedAi: true }),
      ).toEqual({ kind: 'key', provider: 'anthropic', model: null });
    });

    it('skips Trakwyn AI when the plan has none, so the key behind it is the answer', () => {
      expect(
        conversationRunsOn(startedOnOpenAi, { order: ['trakwyn', 'openai'], hostedAi: false }),
      ).toEqual({ kind: 'key', provider: 'openai', model: 'gpt-4o' });
    });

    it('does not guess while a list that leads with Trakwyn AI waits for the plan', () => {
      expect(
        conversationRunsOn(startedOnOpenAi, { order: ['trakwyn', 'openai'], hostedAi: null }),
      ).toBeNull();
    });

    it('does not wait on the plan when a key leads', () => {
      expect(
        conversationRunsOn(startedOnOpenAi, { order: ['openai', 'trakwyn'], hostedAi: null }),
      ).toMatchObject({ kind: 'key', provider: 'openai' });
    });
  });

  describe('with no order to go by', () => {
    it('falls back to the stored key and model while the settings have not loaded', () => {
      expect(conversationRunsOn(startedOnOpenAi, { order: undefined, hostedAi: true })).toEqual({
        kind: 'key',
        provider: 'openai',
        model: 'gpt-4o',
      });
    });

    it('falls back to the stored key when the order is empty', () => {
      expect(conversationRunsOn(startedOnOpenAi, { order: [], hostedAi: true })).toMatchObject({
        kind: 'key',
        provider: 'openai',
      });
    });

    it('reports nothing when there is nothing stored either', () => {
      expect(conversationRunsOn({ llmProvider: null }, { order: [], hostedAi: true })).toBeNull();
      expect(
        conversationRunsOn({ llmProvider: null }, { order: undefined, hostedAi: true }),
      ).toBeNull();
    });
  });
});

describe('newConversationRunsOn', () => {
  it('reports what leads the order', () => {
    expect(newConversationRunsOn({ order: ['anthropic', 'openai'], hostedAi: true })).toEqual({
      kind: 'key',
      provider: 'anthropic',
      model: null,
    });
    expect(newConversationRunsOn({ order: ['trakwyn'], hostedAi: true })).toEqual({
      kind: 'trakwyn',
    });
  });

  it('reports nothing for an empty order', () => {
    expect(newConversationRunsOn({ order: [], hostedAi: true })).toBeNull();
  });
});
