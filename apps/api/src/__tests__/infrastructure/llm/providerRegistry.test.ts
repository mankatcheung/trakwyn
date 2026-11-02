import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PROVIDER_REGISTRY } from '#src/infrastructure/llm/providerRegistry.js';
import { LLM_PROVIDER } from '#src/use-cases/constants.js';

describe('PROVIDER_REGISTRY', () => {
  it('has an entry for every LLM_PROVIDER value', () => {
    for (const provider of Object.values(LLM_PROVIDER)) {
      expect(PROVIDER_REGISTRY[provider]).toBeDefined();
      expect(PROVIDER_REGISTRY[provider].label).toBeTruthy();
    }
  });

  it('throws when creating the custom provider without a base URL', () => {
    expect(() =>
      PROVIDER_REGISTRY[LLM_PROVIDER.CUSTOM].create({
        apiKey: 'key',
        model: 'some-model',
        baseUrl: null,
      }),
    ).toThrow('Custom provider requires both a base URL and a model');
  });

  it('throws when creating the custom provider without a model', () => {
    expect(() =>
      PROVIDER_REGISTRY[LLM_PROVIDER.CUSTOM].create({
        apiKey: 'key',
        model: null,
        baseUrl: 'https://example.com/v1/chat/completions',
      }),
    ).toThrow('Custom provider requires both a base URL and a model');
  });

  it('creates a provider for custom when both are supplied', () => {
    const provider = PROVIDER_REGISTRY[LLM_PROVIDER.CUSTOM].create({
      apiKey: 'key',
      model: 'some-model',
      baseUrl: 'https://example.com/v1/chat/completions',
    });
    expect(provider).toBeDefined();
  });

  describe('reasoning parameters per registry entry (JEF-445)', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    // Only OpenAI's own endpoint and Google's Gemini 2.5 take a switch; every
    // other backend must receive neither field, since unknown ones can 400.
    const expected: Record<string, 'reasoning_effort' | 'thinkingConfig' | null> = {
      [LLM_PROVIDER.OPENAI]: 'reasoning_effort',
      [LLM_PROVIDER.GOOGLEAI]: 'thinkingConfig',
    };

    it.each(Object.values(LLM_PROVIDER))('%s sends only the field it supports', async (name) => {
      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              choices: [{ message: { content: 'ok' } }],
              content: [{ type: 'text', text: 'ok' }],
              candidates: [{ content: { parts: [{ text: 'ok' }] } }],
            }),
          text: () => Promise.resolve(''),
        } as never),
      );
      const model =
        name === LLM_PROVIDER.GOOGLEAI
          ? 'gemini-2.5-flash'
          : name === LLM_PROVIDER.OPENAI
            ? 'gpt-5-mini'
            : 'some-model';
      const provider = PROVIDER_REGISTRY[name].create({
        apiKey: 'key',
        model,
        baseUrl: 'https://example.com/v1/chat/completions',
      });

      await provider.complete([{ role: 'user', content: 'hi' }], undefined, undefined, {
        reasoning: 'off',
      });

      const sent = JSON.stringify(
        JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string),
      );
      expect(sent.includes('reasoning_effort')).toBe(expected[name] === 'reasoning_effort');
      expect(sent.includes('thinkingConfig')).toBe(expected[name] === 'thinkingConfig');
    });
  });
});
