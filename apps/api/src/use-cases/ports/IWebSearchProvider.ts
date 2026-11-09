export type WebSearchTopic = 'general' | 'news';

export interface WebSearchQuery {
  query: string;
  topic: WebSearchTopic;
  maxResults: number;
  /** Only for `news`: how far back a result may be dated. */
  days?: number;
}

/** One hit from a search engine. Everything here is third-party text: the caller fences it. */
export interface WebSearchResult {
  url: string;
  title: string;
  /** A short extract of the page, as the engine returns it. Never empty. */
  snippet: string;
  /** ISO 8601 when the engine knows it. */
  publishedAt: string | null;
}

/**
 * A web search the platform pays for (JEF-538). Snippets only: nothing behind
 * this port fetches a result's page, so it opens no path from a search result
 * to a server-side request.
 *
 * Throws when the search itself fails (provider error, timeout). A search
 * that finds nothing resolves to an empty list.
 */
export interface IWebSearchProvider {
  search(query: WebSearchQuery): Promise<WebSearchResult[]>;
}
