import type { AiFeature, LlmUsageSource } from '#src/use-cases/constants.js';
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
  /** Hidden thinking tokens, part of `completionTokens` (JEF-445); null when not reported. */
  reasoningTokens?: number | null;
  /** Workers AI neurons for the call (JEF-497); null when not reported or off the platform path. */
  neurons?: number | null;
  /** Whether the response carried reasoning output (JEF-497); null off the platform path. */
  reasoningReturned?: boolean | null;
  /** True when the counts are an estimate (F3); defaults to false. */
  estimated?: boolean;
  /** Micro-USD; null when the model has no listed price (JEF-444). */
  costMicros?: number | null;
  feature?: AiFeature | null;
  /** The version of the prompt the call sent (JEF-505); null when it sent none. */
  promptVersion?: number | null;
  /** Defaults to `byok` in the database. */
  source?: LlmUsageSource;
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
  /**
   * What a user's calls from `since` cost in micro-USD, for one `source`
   * (JEF-448). Events with no listed price (`costMicros` null) add nothing.
   * Reads the primary database and does not swallow a failure: the caller
   * enforces a spending ceiling with it and must fail closed.
   */
  sumCostMicros(userId: string, since: Date, source: LlmUsageSource): Promise<number>;
}
