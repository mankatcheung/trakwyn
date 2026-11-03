import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { PlatformLLMProviderFactory } from '#src/infrastructure/llm/PlatformLLMProviderFactory.js';
import { GoogleAILLMProvider } from '#src/infrastructure/llm/GoogleAILLMProvider.js';
import { OpenAICompatibleLLMProvider } from '#src/infrastructure/llm/OpenAICompatibleLLMProvider.js';
import { LLM } from '#src/use-cases/constants.js';

const GATEWAY = 'https://gateway.ai.cloudflare.com/v1/acct/gw';

const enabledEnv = {
  HOSTED_AI_ENABLED: 'true',
  PLATFORM_GOOGLEAI_API_KEY: 'g-key',
  PLATFORM_OPENAI_API_KEY: 'o-key',
};

const okGemini = {
  ok: true,
  status: 200,
  json: () =>
    Promise.resolve({
      candidates: [{ content: { parts: [{ text: 'hi' }] } }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    }),
  text: () => Promise.resolve(''),
};
const okOpenAi = {
  ok: true,
  status: 200,
  json: () =>
    Promise.resolve({
      choices: [{ message: { content: 'hi', tool_calls: [] } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
  text: () => Promise.resolve(''),
};

describe('PlatformLLMProviderFactory', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is disabled and builds nothing unless HOSTED_AI_ENABLED is exactly "true"', () => {
    for (const value of [undefined, 'false', '1', 'TRUE']) {
      const factory = new PlatformLLMProviderFactory({
        env: { ...enabledEnv, HOSTED_AI_ENABLED: value },
      });
      expect(factory.isEnabled()).toBe(false);
      expect(factory.legs('lite')).toEqual([]);
    }
  });

  it('builds Gemini as primary and OpenAI as fallback by default', () => {
    const legs = new PlatformLLMProviderFactory({ env: enabledEnv }).legs('lite');

    expect(legs.map((l) => l.providerId)).toEqual(['googleai', 'openai']);
    expect(legs[0]!.provider).toBeInstanceOf(GoogleAILLMProvider);
    expect(legs[1]!.provider).toBeInstanceOf(OpenAICompatibleLLMProvider);
    expect(legs[0]!.model).toBe('gemini-2.5-flash-lite');
  });

  it('honours PLATFORM_LLM_PRIMARY and PLATFORM_LLM_FALLBACK', () => {
    const legs = new PlatformLLMProviderFactory({
      env: { ...enabledEnv, PLATFORM_LLM_PRIMARY: 'openai', PLATFORM_LLM_FALLBACK: 'googleai' },
    }).legs('lite');

    expect(legs.map((l) => l.providerId)).toEqual(['openai', 'googleai']);
  });

  it('fails on first use, not at construction, when the primary key is missing', () => {
    const factory = new PlatformLLMProviderFactory({
      env: { HOSTED_AI_ENABLED: 'true', PLATFORM_OPENAI_API_KEY: 'o-key' },
    });

    expect(() => factory.legs('lite')).toThrowError(/not configured/i);
  });

  it('drops the failover leg when its key is missing', () => {
    const legs = new PlatformLLMProviderFactory({
      env: { HOSTED_AI_ENABLED: 'true', PLATFORM_GOOGLEAI_API_KEY: 'g-key' },
    }).legs('lite');

    expect(legs.map((l) => l.providerId)).toEqual(['googleai']);
  });

  it('rejects a provider that hosted AI does not support', () => {
    const factory = new PlatformLLMProviderFactory({
      env: { ...enabledEnv, PLATFORM_LLM_PRIMARY: 'anthropic' },
    });

    expect(() => factory.legs('lite')).toThrowError(/not supported/i);
  });

  it('calls the providers directly when no gateway is set', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okGemini as unknown as Response);
    const [primary] = new PlatformLLMProviderFactory({ env: enabledEnv }).legs('lite');

    await primary!.provider.complete([{ role: 'user', content: 'x' }]);

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toBe(`${LLM.GOOGLEAI_API_URL}/gemini-2.5-flash-lite:generateContent`);
    expect(JSON.stringify((init as RequestInit).headers)).not.toContain('cf-aig-authorization');
  });

  it('routes Gemini through the gateway path and sends cf-aig-authorization', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okGemini as unknown as Response);
    const [primary] = new PlatformLLMProviderFactory({
      env: {
        ...enabledEnv,
        PLATFORM_LLM_GATEWAY_BASE_URL: `${GATEWAY}/`,
        PLATFORM_LLM_GATEWAY_TOKEN: 'gw-token',
      },
    }).legs('lite');

    await primary!.provider.complete([{ role: 'user', content: 'x' }]);

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toBe(
      `${GATEWAY}/google-ai-studio/v1beta/models/gemini-2.5-flash-lite:generateContent`,
    );
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['cf-aig-authorization']).toBe('Bearer gw-token');
    expect(headers['x-goog-api-key']).toBe('g-key');
  });

  it('routes OpenAI through the gateway path and sends cf-aig-authorization', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okOpenAi as unknown as Response);
    const legs = new PlatformLLMProviderFactory({
      env: {
        ...enabledEnv,
        PLATFORM_LLM_GATEWAY_BASE_URL: GATEWAY,
        PLATFORM_LLM_GATEWAY_TOKEN: 'gw-token',
      },
    }).legs('lite');

    await legs[1]!.provider.complete([{ role: 'user', content: 'x' }]);

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toBe(`${GATEWAY}/openai/chat/completions`);
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['cf-aig-authorization']).toBe('Bearer gw-token');
    expect(headers.Authorization).toBe('Bearer o-key');
  });

  it('points both legs at the fake completions route, with no keys, in fake mode', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okOpenAi as unknown as Response);
    const legs = new PlatformLLMProviderFactory({
      env: { HOSTED_AI_ENABLED: 'true', LLM_PROVIDER_MODE: 'fake', PORT: '4000' },
    }).legs('lite');

    expect(legs).toHaveLength(2);
    await legs[0]!.provider.complete([{ role: 'user', content: 'x' }]);
    expect(String(vi.mocked(fetch).mock.calls[0]![0])).toBe(
      'http://127.0.0.1:4000/llm-test/fake/chat/completions',
    );
  });

  it('builds the model of the tier asked for (JEF-448)', () => {
    const factory = new PlatformLLMProviderFactory({ env: enabledEnv });

    expect(factory.legs('lite').map((l) => l.model)).toEqual([
      'gemini-2.5-flash-lite',
      'gpt-5.6-luna',
    ]);
    expect(factory.legs('mid').map((l) => l.model)).toEqual(['gemini-2.5-flash', 'gpt-5.6-luna']);
  });
});
