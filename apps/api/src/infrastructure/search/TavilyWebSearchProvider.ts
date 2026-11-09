import type {
  IWebSearchProvider,
  WebSearchQuery,
  WebSearchResult,
} from '#src/use-cases/ports/IWebSearchProvider.js';
import { TAVILY } from '#src/infrastructure/config/constants.js';
import { readBounded } from '#src/infrastructure/net/readBounded.js';

interface Deps {
  apiKey: string;
}

/** A search that did not return results. Carries the status, never the key or the query. */
export class WebSearchError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'WebSearchError';
  }
}

interface TavilyResult {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  published_date?: unknown;
}

/** Tavily has no "last N days", only these windows; the smallest that covers `days`. */
function timeRange(days: number): 'day' | 'week' | 'month' | 'year' {
  if (days <= 1) return 'day';
  if (days <= 7) return 'week';
  if (days <= 31) return 'month';
  return 'year';
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Tavily's search API (JEF-538): `POST /search` with the key as a bearer
 * token, `basic` depth (one credit). The endpoint is a fixed vendor address,
 * not something a user supplies, so it does not go through `IOutboundUrlPolicy`.
 *
 * Throws `WebSearchError` for any non-2xx answer (401 a bad key, 429 a rate
 * limit, 432/433 a plan or pay-as-you-go limit), a malformed body or a
 * timeout; the caller treats every one as "no search this time".
 */
export class TavilyWebSearchProvider implements IWebSearchProvider {
  constructor(private readonly deps: Deps) {}

  async search({ query, topic, maxResults, days }: WebSearchQuery): Promise<WebSearchResult[]> {
    const response = await fetch(TAVILY.SEARCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.deps.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        topic,
        search_depth: TAVILY.SEARCH_DEPTH,
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        // Dates are what let the briefing say how old a claim is, so ask for
        // them on every topic, not only news.
        include_published_date: true,
        ...(topic === 'news' && days ? { time_range: timeRange(days) } : {}),
      }),
      signal: AbortSignal.timeout(TAVILY.TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new WebSearchError(`Tavily search answered ${response.status}`, response.status);
    }

    let body: unknown;
    try {
      body = JSON.parse(await readBounded(response.body, TAVILY.MAX_RESPONSE_BYTES));
    } catch {
      throw new WebSearchError('Tavily search answered with a body that is not JSON', null);
    }

    const results = (body as { results?: unknown } | null)?.results;
    if (!Array.isArray(results)) {
      throw new WebSearchError('Tavily search answered without a results list', null);
    }

    return results.flatMap((raw: TavilyResult): WebSearchResult[] => {
      if (typeof raw.url !== 'string' || typeof raw.content !== 'string') return [];
      const snippet = raw.content.trim();
      if (!snippet) return [];
      return [
        {
          url: raw.url,
          title: typeof raw.title === 'string' ? raw.title : '',
          snippet,
          publishedAt: isoOrNull(raw.published_date),
        },
      ];
    });
  }
}
