export type LlmUsageEvent = {
  id: string;
  userId: string;
  provider: string;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  /** Counts estimated from the request rather than reported by the provider (F3). */
  estimated: boolean;
  createdAt: Date;
};

/**
 * One provider's usage since the cutoff the caller asked for — the shape
 * `ILlmUsageEventRepository.summarizeByUserId` returns, aggregated across
 * every model that provider's key has been used with (JEF-250). No cost
 * estimate: list prices drift, and a stale number is worse than none. Token
 * counts only, scoped to the current calendar month by
 * `GetLlmUsageSummaryUseCase` — older events aren't deleted, just excluded.
 */
export type LlmUsageSummary = {
  provider: string;
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  /**
   * Summed over the events that reported a split (T3); the share of
   * `promptTokens` that was a cache hit / write. Zero both when nothing was
   * cached and when the provider never says — the settings page can only
   * show a rate for providers that report one.
   */
  cacheReadTokens: number;
  cacheWriteTokens: number;
  lastUsedAt: Date;
};

/**
 * A provider's usage alongside the ceiling set on its key (JEF-258).
 *
 * `limitReached` is computed once, by `GetLlmUsageSummaryUseCase`, from the
 * same `isLimitReached` the provider factory refuses on — so what the meter
 * shows and what the API allows cannot disagree.
 */
export type LlmUsageSummaryWithLimit = LlmUsageSummary & {
  monthlyTokenLimit: number | null;
  limitReached: boolean;
};
