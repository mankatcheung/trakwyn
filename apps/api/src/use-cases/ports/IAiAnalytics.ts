/**
 * Product analytics for AI calls (JEF-566). Every field is typed and bounded:
 * ids, names, counts, durations and enums. There is deliberately no field for
 * a prompt, message, tool result, completion or any other free text, so a
 * caller cannot send one. `userId` is the Trakwyn id; the adapter pseudonymises
 * it, so no caller can forget to.
 *
 * Implementations never throw and never block the caller: analytics must not
 * fail an AI action.
 */
export type AiAnalyticsOutcome = 'ok' | 'error' | 'aborted';

export interface AiGenerationEvent {
  userId: string;
  traceId: string;
  feature: string;
  provider: string;
  model: string;
  source: string;
  promptVersion: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Micro-USD, or null when the model has no known price. */
  costMicros: number | null;
  latencyMs: number;
  outcome: AiAnalyticsOutcome;
  errorKind: string | null;
}

export interface AiSpanEvent {
  userId: string;
  traceId: string;
  /** A name from a bounded set, such as a tool name, never user text. */
  name: string;
  latencyMs: number;
  outcome: AiAnalyticsOutcome;
}

export interface AiFeedbackAnalyticsEvent {
  userId: string;
  traceId: string | null;
  feature: string;
  rating: string;
  reason: string | null;
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
}

export interface IAiAnalytics {
  generation(event: AiGenerationEvent): void;
  span(event: AiSpanEvent): void;
  feedback(event: AiFeedbackAnalyticsEvent): void;
  /** Sends what is queued and stops. Called once, when the server closes. */
  shutdown(): Promise<void>;
}
