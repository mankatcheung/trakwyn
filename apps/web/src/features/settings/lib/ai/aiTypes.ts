export type LlmApiKey = {
  provider: string;
  model: string | null;
  baseUrl: string | null;
  /** Monthly prompt+completion token ceiling; null means no limit (JEF-258). */
  monthlyTokenLimit: number | null;
};

export type TestLlmApiKeyResult = {
  ok: boolean;
  error: string | null;
};

export type LlmUsageSummary = {
  provider: string;
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  /** Share of promptTokens served from / written to the provider's prompt cache this month. */
  cacheReadTokens: number;
  cacheWriteTokens: number;
  lastUsedAt: string;
  monthlyTokenLimit: number | null;
  /**
   * Decided by the API from the same helper the provider factory refuses on,
   * so this and the meter beside it cannot disagree with what a call does.
   */
  limitReached: boolean;
};
