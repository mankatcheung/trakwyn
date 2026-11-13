import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_LLM, TAVILY } from '#src/infrastructure/config/constants.js';
import { LLM_SPAN } from '#src/infrastructure/llm/TracingLLMProvider.js';
import { TavilyWebSearchProvider } from '#src/infrastructure/search/TavilyWebSearchProvider.js';

/**
 * The privacy policy's claims about AI data (JEF-549) are true only because of
 * the settings and code checked here. Each message names the privacy key to
 * re-read and the row of `docs/ai-data-handling.md` to update, so a change that
 * breaks a claim cannot pass without someone looking at the policy.
 *
 * This reads files across apps the way `releaseVersioning.test.ts` reads
 * `ci.yml`. It covers AI flows only: the other sub-processors belong to the
 * launch compliance checklist (JEF-132).
 */

const REPO = join(process.cwd(), '..', '..');
const read = (path: string) => readFileSync(join(REPO, path), 'utf8');

const fail = (key: string, row: string, what: string) =>
  `${what}. Re-read the privacy key "${key}" and update the "${row}" row in docs/ai-data-handling.md.`;

describe('AI data handling matches the privacy policy', () => {
  describe('AI Gateway (legal.privacy.aiHostedRetentionBody)', () => {
    const tf = read('infra/cloudflare/ai_gateway.tf');
    const key = 'legal.privacy.aiHostedRetentionBody';
    const row = 'Hosted LLM';

    it('keeps gateway logging off', () => {
      expect(
        /^\s*collect_logs\s*=\s*false\s*$/m.test(tf),
        fail(
          key,
          row,
          'ai_gateway.tf must set collect_logs = false ("We turn gateway logging off")',
        ),
      ).toBe(true);
    });

    it('keeps gateway caching off', () => {
      expect(
        /^\s*cache_ttl\s*=\s*0\s*$/m.test(tf),
        fail(key, row, 'ai_gateway.tf must set cache_ttl = 0 ("We turn gateway caching off")'),
      ).toBe(true);
    });
  });

  describe('platform legs (legal.privacy.aiHostedBody)', () => {
    const key = 'legal.privacy.aiHostedBody';
    const row = 'Hosted LLM';

    it('sends every hosted call to api.cloudflare.com', () => {
      expect(
        new URL(PLATFORM_LLM.REST_BASE).hostname,
        fail(key, row, 'PLATFORM_LLM.REST_BASE must stay on api.cloudflare.com'),
      ).toBe('api.cloudflare.com');
      expect(new URL(PLATFORM_LLM.REST_BASE).protocol).toBe('https:');
    });

    it('only names Workers AI models, never a vendor model id', () => {
      const models = [...PLATFORM_LLM.MODELS.lite, ...PLATFORM_LLM.MODELS.mid];
      for (const model of models) {
        expect(
          model.startsWith('@cf/'),
          fail(key, row, `${model} is not a Workers AI model, so content may leave Cloudflare`),
        ).toBe(true);
      }
    });

    it('builds legs from the Cloudflare base and nothing else but the local fake route', () => {
      const source = read('apps/api/src/infrastructure/llm/PlatformLLMProviderFactory.ts');
      // Strip comments, then every URL literal left must be the loopback fake route.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const urls = code.match(/https?:\/\/[^\s'"`$]+/g) ?? [];
      for (const url of urls) {
        expect(
          url.startsWith('http://127.0.0.1'),
          fail(key, row, `PlatformLLMProviderFactory builds a leg to ${url}`),
        ).toBe(true);
      }
      expect(code).toContain('PLATFORM_LLM.REST_BASE');
    });
  });

  describe('Tavily (legal.privacy.webSearchBody)', () => {
    const key = 'legal.privacy.webSearchBody';
    const row = 'Tavily web search';

    afterEach(() => vi.unstubAllGlobals());

    it('sends only the query and search settings, never a page, user or application field', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      await new TavilyWebSearchProvider({ apiKey: 'tvly-test' }).search({
        query: '"Acme" news funding',
        topic: 'news',
        maxResults: 5,
        days: 7,
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(
        new URL(url).hostname,
        fail(key, row, 'Tavily must be reached at its fixed host'),
      ).toBe(new URL(TAVILY.SEARCH_URL).hostname);
      expect(
        Object.keys(JSON.parse(init.body)).sort(),
        fail(key, row, 'The Tavily request body gained or lost a field'),
      ).toEqual(
        [
          'include_answer',
          'include_images',
          'include_published_date',
          'include_raw_content',
          'max_results',
          'query',
          'search_depth',
          'time_range',
          'topic',
        ].sort(),
      );
    });

    it('builds its queries from the company name and site host only', () => {
      const source = read(
        'apps/api/src/infrastructure/companyResearch/SearchCompanyResearchSource.ts',
      );
      const queries = [...source.matchAll(/query:\s*`([^`]*)`/g)].map((m) => m[1]);
      expect(queries.length, fail(key, row, 'No Tavily query template was found')).toBeGreaterThan(
        0,
      );
      for (const template of queries) {
        const interpolations = [...template.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1].trim());
        expect(
          interpolations.every((name) => name === 'subject'),
          fail(
            key,
            row,
            `A Tavily query interpolates something besides the company subject: ${template}`,
          ),
        ).toBe(true);
      }
    });
  });

  describe('LLM telemetry (no legal key: Axiom receives tokens and cost only)', () => {
    const key = 'legal.privacy.aiHostedRetentionBody';
    const row = 'LLM telemetry to Axiom';

    it('names no span attribute that could carry message or completion text', () => {
      for (const attribute of Object.values(LLM_SPAN)) {
        expect(
          /prompt(?!_version)|message|completion|content|text|reply|response(?!\.status)/i.test(
            attribute,
          ),
          fail(key, row, `LLM_SPAN attribute "${attribute}" looks like it carries content`),
        ).toBe(false);
      }
    });

    it('keeps the test that serialises a span and finds no prompt or reply in it (JEF-113)', () => {
      const test = read('apps/api/src/__tests__/infrastructure/llm/TracingLLMProvider.test.ts');
      expect(test).toContain('expect(serialized).not.toContain(SECRET_PROMPT)');
      expect(test).toContain('expect(serialized).not.toContain(SECRET_REPLY)');
    });
  });

  describe('LLM usage analytics (legal.privacy.aiUsageAnalyticsBody)', () => {
    const key = 'legal.privacy.aiUsageAnalyticsBody';
    const row = 'LLM usage analytics to PostHog';
    const adapter = read('apps/api/src/infrastructure/analytics/PostHogAiAnalytics.ts');
    const port = read('apps/api/src/use-cases/ports/IAiAnalytics.ts');

    it('keeps privacy mode, GeoIP off and no person profile', () => {
      expect(adapter, fail(key, row, 'privacyMode must stay true')).toMatch(/privacyMode:\s*true/);
      expect(adapter, fail(key, row, 'disableGeoip must stay true')).toMatch(
        /disableGeoip:\s*true/,
      );
      expect(adapter, fail(key, row, 'events must not create person profiles')).toContain(
        '$process_person_profile: false',
      );
    });

    it('gives the port no field that could carry text', () => {
      const code = port.replace(/\/\*[\s\S]*?\*\//g, '');
      expect(
        /\b(content|messages?|prompt|completion|reply|input|output|text)\??:/i.test(code),
        fail(key, row, 'IAiAnalytics gained a field that looks like it carries content'),
      ).toBe(false);
    });

    it('says it in every locale', () => {
      for (const locale of ['en', 'en-GB', 'zh-CN', 'zh-HK', 'zh-TW']) {
        expect(
          read(`apps/web/src/i18n/${locale}.json`),
          fail(key, row, `${locale}.json lost the PostHog usage-analytics paragraph`),
        ).toContain(`"${key}"`);
      }
    });
  });

  it('documents every guarded flow', () => {
    const doc = read('docs/ai-data-handling.md');
    for (const row of [
      'Hosted LLM',
      'Tavily web search',
      'LLM telemetry to Axiom',
      'LLM usage analytics to PostHog',
    ]) {
      expect(doc, `docs/ai-data-handling.md has no "${row}" row`).toContain(row);
    }
    expect(doc).toMatch(/Last checked: \d{4}-\d{2}-\d{2}/);
  });
});
