import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { PlatformLLMProviderFactory } from '#src/infrastructure/llm/PlatformLLMProviderFactory.js';
import { OpenAICompatibleLLMProvider } from '#src/infrastructure/llm/OpenAICompatibleLLMProvider.js';
import { estimateCostMicros } from '#src/infrastructure/llm/estimateCostMicros.js';
import { AI_FEATURE } from '#src/use-cases/constants.js';

const CALL = { userId: 'user-secret-id-123', feature: AI_FEATURE.COVER_LETTER };

const GEMMA = '@cf/google/gemma-4-26b-a4b-it';
const GPT_OSS = '@cf/openai/gpt-oss-120b';

const enabledEnv = {
  HOSTED_AI_ENABLED: 'true',
  PLATFORM_CLOUDFLARE_ACCOUNT_ID: 'acct-1',
  PLATFORM_CLOUDFLARE_API_TOKEN: 'cf-token',
  PLATFORM_CLOUDFLARE_GATEWAY_ID: 'gw-1',
};

const okCompletion = {
  ok: true,
  status: 200,
  json: () =>
    Promise.resolve({
      choices: [{ message: { content: 'hi', tool_calls: [] }, finish_reason: 'stop' }],
      usage: {
        prompt_tokens: 3,
        completion_tokens: 4,
        prompt_tokens_details: { cached_tokens: 0 },
      },
    }),
  text: () => Promise.resolve(''),
};

async function lastRequest(): Promise<{
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}> {
  const calls = vi.mocked(fetch).mock.calls;
  const [url, init] = calls[calls.length - 1]!;
  const request = init as RequestInit;
  return {
    url: String(url),
    headers: request.headers as Record<string, string>,
    body: JSON.parse(String(request.body)) as Record<string, unknown>,
  };
}

describe('PlatformLLMProviderFactory (Workers AI)', () => {
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
      expect(factory.legs('lite', CALL)).toEqual([]);
    }
  });

  it('builds Gemma then gpt-oss for lite, and the reverse for mid (failover order)', () => {
    const factory = new PlatformLLMProviderFactory({ env: enabledEnv });

    expect(factory.legs('lite', CALL).map((l) => l.model)).toEqual([GEMMA, GPT_OSS]);
    expect(factory.legs('mid', CALL).map((l) => l.model)).toEqual([GPT_OSS, GEMMA]);
    for (const leg of factory.legs('lite', CALL)) {
      expect(leg.providerId).toBe('workersai');
      expect(leg.provider).toBeInstanceOf(OpenAICompatibleLLMProvider);
    }
  });

  it.each([
    ['account id', { PLATFORM_CLOUDFLARE_ACCOUNT_ID: undefined }],
    ['API token', { PLATFORM_CLOUDFLARE_API_TOKEN: undefined }],
    ['blank token', { PLATFORM_CLOUDFLARE_API_TOKEN: '  ' }],
  ])('fails on first use, not at construction, without the %s', (_name, override) => {
    const factory = new PlatformLLMProviderFactory({ env: { ...enabledEnv, ...override } });

    expect(() => factory.legs('lite', CALL)).toThrowError(/not configured/i);
  });

  it('calls the Cloudflare REST route with the bearer token and the gateway header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okCompletion as unknown as Response);
    const [primary] = new PlatformLLMProviderFactory({ env: enabledEnv }).legs('lite', CALL);

    await primary!.provider.complete([{ role: 'user', content: 'x' }]);

    const { url, headers, body } = await lastRequest();
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct-1/ai/v1/chat/completions');
    expect(headers.Authorization).toBe('Bearer cf-token');
    expect(headers['cf-aig-gateway-id']).toBe('gw-1');
    expect(body.model).toBe(GEMMA);
  });

  it('defaults the gateway id to trakwyn', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okCompletion as unknown as Response);
    const env = { ...enabledEnv, PLATFORM_CLOUDFLARE_GATEWAY_ID: undefined };
    const [primary] = new PlatformLLMProviderFactory({ env }).legs('lite', CALL);

    await primary!.provider.complete([{ role: 'user', content: 'x' }]);

    expect((await lastRequest()).headers['cf-aig-gateway-id']).toBe('trakwyn');
  });

  describe('cf-aig-metadata (JEF-497)', () => {
    it('tags a gateway call with a user hash, the feature and the tier, never the user id', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okCompletion as unknown as Response);
      const [primary] = new PlatformLLMProviderFactory({ env: enabledEnv }).legs('mid', CALL);

      await primary!.provider.complete([{ role: 'user', content: 'x' }]);

      const raw = (await lastRequest()).headers['cf-aig-metadata']!;
      const metadata = JSON.parse(raw) as Record<string, unknown>;
      expect(metadata).toEqual({
        user: expect.stringMatching(/^[0-9a-f]{16}$/),
        feature: 'coverLetter',
        tier: 'mid',
      });
      expect(raw).not.toContain(CALL.userId);
    });

    it('gives the same user the same hash on both legs and different users different ones', async () => {
      vi.mocked(fetch).mockResolvedValue(okCompletion as unknown as Response);
      const factory = new PlatformLLMProviderFactory({ env: enabledEnv });
      const hashOf = async (userId: string, leg: number): Promise<unknown> => {
        await factory
          .legs('lite', { ...CALL, userId })
          [leg]!.provider.complete([{ role: 'user', content: 'x' }]);
        return (JSON.parse((await lastRequest()).headers['cf-aig-metadata']!) as { user: string })
          .user;
      };

      expect(await hashOf('user-a', 0)).toBe(await hashOf('user-a', 1));
      expect(await hashOf('user-a', 0)).not.toBe(await hashOf('user-b', 0));
    });

    it('sends no metadata to the fake route, which is this server and not the gateway', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okCompletion as unknown as Response);
      const [primary] = new PlatformLLMProviderFactory({
        env: { HOSTED_AI_ENABLED: 'true', LLM_PROVIDER_MODE: 'fake' },
      }).legs('lite', CALL);

      await primary!.provider.complete([{ role: 'user', content: 'x' }]);

      expect((await lastRequest()).headers).not.toHaveProperty('cf-aig-metadata');
    });
  });

  it('never calls a Google or OpenAI endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(okCompletion as unknown as Response);
    for (const leg of new PlatformLLMProviderFactory({ env: enabledEnv }).legs('mid', CALL)) {
      await leg.provider.complete([{ role: 'user', content: 'x' }]);
    }

    for (const [url] of vi.mocked(fetch).mock.calls) {
      expect(new URL(String(url)).hostname).toBe('api.cloudflare.com');
    }
  });

  describe('reasoning is turned off or down per model (JEF-445)', () => {
    it('sends chat_template_kwargs.enable_thinking=false to Gemma', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okCompletion as unknown as Response);
      const [gemma] = new PlatformLLMProviderFactory({ env: enabledEnv }).legs('lite', CALL);

      await gemma!.provider.complete([{ role: 'user', content: 'x' }], 100, undefined, {
        reasoning: 'off',
      });

      const { body } = await lastRequest();
      expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
      expect(body).not.toHaveProperty('reasoning_effort');
    });

    it('sends reasoning_effort=low to gpt-oss, which has no off switch', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okCompletion as unknown as Response);
      const [oss] = new PlatformLLMProviderFactory({ env: enabledEnv }).legs('mid', CALL);

      await oss!.provider.complete([{ role: 'user', content: 'x' }], 100, undefined, {
        reasoning: 'off',
      });

      const { body } = await lastRequest();
      expect(body.reasoning_effort).toBe('low');
      expect(body).not.toHaveProperty('chat_template_kwargs');
    });

    it('sends neither when the caller leaves reasoning at default', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(okCompletion as unknown as Response);
      const [gemma] = new PlatformLLMProviderFactory({ env: enabledEnv }).legs('lite', CALL);

      await gemma!.provider.complete([{ role: 'user', content: 'x' }], 100, undefined, {
        reasoning: 'default',
      });

      const { body } = await lastRequest();
      expect(body).not.toHaveProperty('chat_template_kwargs');
      expect(body).not.toHaveProperty('reasoning_effort');
    });
  });

  it('prices every platform model, so the daily breaker counts its spend (JEF-449)', () => {
    const usage = { promptTokens: 1_000_000, completionTokens: 1_000_000 };

    expect(estimateCostMicros(usage, 'workersai', GEMMA)).toBe(400_000);
    expect(estimateCostMicros(usage, 'workersai', GPT_OSS)).toBe(1_100_000);
  });

  it('points both legs at the fake completions route, with no credentials, in fake mode', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okCompletion as unknown as Response);
    const legs = new PlatformLLMProviderFactory({
      env: { HOSTED_AI_ENABLED: 'true', LLM_PROVIDER_MODE: 'fake', PORT: '4000' },
    }).legs('lite', CALL);

    expect(legs).toHaveLength(2);
    await legs[0]!.provider.complete([{ role: 'user', content: 'x' }]);
    expect((await lastRequest()).url).toBe('http://127.0.0.1:4000/llm-test/fake/chat/completions');
  });
});
