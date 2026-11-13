import { PostHog } from 'posthog-node';
import {
  pseudonymousSessionId,
  pseudonymousUserId,
} from '#src/infrastructure/privacy/pseudonymousUserId.js';
import { POSTHOG } from '#src/infrastructure/config/constants.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type {
  AiFeedbackAnalyticsEvent,
  AiGenerationEvent,
  AiSpanEvent,
  IAiAnalytics,
} from '#src/use-cases/ports/IAiAnalytics.js';

/** The only client surface used, so a test can pass a fake without `posthog-node`. */
export interface PostHogCaptureClient {
  capture(message: {
    distinctId: string;
    event: string;
    properties: Record<string, unknown>;
    disableGeoip: boolean;
  }): void;
  shutdown(shutdownTimeoutMs?: number): Promise<void>;
}

interface Deps {
  apiKey: string;
  host: string;
  release: string;
  logger: ILogger;
  /** Replaced in tests. */
  client?: PostHogCaptureClient;
}

const MICROS_PER_USD = 1_000_000;
const MS_PER_SECOND = 1000;

/**
 * Sends AI usage metadata to PostHog (JEF-566). The one file that imports
 * `posthog-node`. Privacy is fixed here rather than left to callers: privacy
 * mode on, GeoIP off, no person profile, a pseudonymous distinct id. Each
 * payload is built field by field from the typed event, so a prompt or reply
 * has nowhere to ride along, and `$ai_input`, `$ai_output_choices` and
 * `$ai_output` are never set.
 */
export class PostHogAiAnalytics implements IAiAnalytics {
  private readonly client: PostHogCaptureClient;
  private readonly release: string;
  private readonly logger: ILogger;

  constructor({ apiKey, host, release, logger, client }: Deps) {
    this.release = release;
    this.logger = logger;
    this.client =
      client ??
      new PostHog(apiKey, {
        host,
        privacyMode: true,
        disableGeoip: true,
        flushAt: POSTHOG.FLUSH_AT,
        flushInterval: POSTHOG.FLUSH_INTERVAL_MS,
      });
  }

  generation(event: AiGenerationEvent): void {
    this.send(event.userId, '$ai_generation', {
      $ai_trace_id: event.traceId,
      $ai_provider: event.provider,
      $ai_model: event.model,
      $ai_input_tokens: event.inputTokens,
      $ai_output_tokens: event.outputTokens,
      $ai_cache_read_input_tokens: event.cacheReadTokens,
      $ai_cache_creation_input_tokens: event.cacheWriteTokens,
      $ai_latency: event.latencyMs / MS_PER_SECOND,
      $ai_is_error: event.outcome === 'error',
      ...(event.costMicros === null
        ? {}
        : { $ai_total_cost_usd: event.costMicros / MICROS_PER_USD }),
      feature: event.feature,
      source: event.source,
      prompt_version: event.promptVersion,
      outcome: event.outcome,
      error_kind: event.errorKind,
      ...(event.spanId === undefined ? {} : { $ai_span_id: event.spanId }),
      ...(event.sessionKey === undefined
        ? {}
        : { $ai_session_id: pseudonymousSessionId(event.sessionKey) }),
      ...(event.timeToFirstTokenMs === undefined
        ? {}
        : { $ai_time_to_first_token: event.timeToFirstTokenMs / MS_PER_SECOND }),
      ...(event.tier === undefined ? {} : { tier: event.tier }),
      ...(event.reasoningTokens === undefined ? {} : { reasoning_tokens: event.reasoningTokens }),
    });
  }

  span(event: AiSpanEvent): void {
    this.send(event.userId, '$ai_span', {
      $ai_trace_id: event.traceId,
      $ai_span_name: event.name,
      $ai_latency: event.latencyMs / MS_PER_SECOND,
      $ai_is_error: event.outcome === 'error',
      outcome: event.toolOutcome ?? event.outcome,
      ...(event.spanId === undefined ? {} : { $ai_span_id: event.spanId }),
      ...(event.parentId === undefined ? {} : { $ai_parent_id: event.parentId }),
      ...(event.surface === undefined ? {} : { surface: event.surface }),
      ...(event.access === undefined ? {} : { access: event.access }),
      ...(event.resultBytes === undefined ? {} : { result_bytes: event.resultBytes }),
    });
  }

  feedback(event: AiFeedbackAnalyticsEvent): void {
    this.send(event.userId, '$ai_feedback', feedbackProperties(event));
  }

  feedbackCleared(event: AiFeedbackAnalyticsEvent): void {
    this.send(event.userId, 'ai_output_rating_cleared', feedbackProperties(event));
  }

  async shutdown(): Promise<void> {
    try {
      await this.client.shutdown(POSTHOG.SHUTDOWN_TIMEOUT_MS);
    } catch (err) {
      this.logger.warn('posthog.shutdown_failed', err);
    }
  }

  private send(userId: string, name: string, properties: Record<string, unknown>): void {
    try {
      this.client.capture({
        distinctId: pseudonymousUserId(userId),
        event: name,
        disableGeoip: true,
        properties: {
          ...properties,
          $process_person_profile: false,
          release: this.release,
        },
      });
    } catch (err) {
      // The event name only: the payload is never logged.
      this.logger.warn('posthog.capture_failed', err, { event: name });
    }
  }
}

/** Field by field, so nothing a caller smuggles into the event object is sent. */
function feedbackProperties(event: AiFeedbackAnalyticsEvent): Record<string, unknown> {
  return {
    $ai_trace_id: event.traceId,
    feature: event.feature,
    rating: event.rating,
    reason: event.reason,
    $ai_provider: event.provider,
    $ai_model: event.model,
    prompt_version: event.promptVersion,
    source: event.source,
    tier: event.tier,
  };
}
