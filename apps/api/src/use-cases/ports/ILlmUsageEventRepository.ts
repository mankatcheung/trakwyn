import type { LlmUsageSummary } from '#src/domain/llmUsageEvent/LlmUsageEvent.js';

export interface RecordLlmUsageEventData {
  id: string;
  userId: string;
  provider: string;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  /** See `LLMUsage` — null when the provider reported no split. */
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  /** True when the counts are an estimate (F3); defaults to false. */
  estimated?: boolean;
}

export interface ILlmUsageEventRepository {
  record(data: RecordLlmUsageEventData): Promise<void>;
  /**
   * Grouped by provider, most-recently-used first, counting only events at
   * or after `since` — the caller (`GetLlmUsageSummaryUseCase`) is what
   * decides that means "this calendar month" (JEF-250 follow-up: usage
   * resets monthly, prices weren't wanted since they drift). Older events
   * aren't deleted, just excluded from this sum.
   */
  summarizeByUserId(userId: string, since: Date): Promise<LlmUsageSummary[]>;
}
