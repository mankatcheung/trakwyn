import type { IAiAnalytics } from '#src/use-cases/ports/IAiAnalytics.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type {
  AiFeedbackEvent,
  IAiFeedbackObserver,
} from '#src/use-cases/ports/IAiFeedbackObserver.js';

/** The `fields.event` of the log line, for Axiom queries (see `observability/CLAUDE.md`). */
export const AI_FEEDBACK_LOG_EVENT = 'ai.feedback.rated';

interface Deps {
  logger: ILogger;
  aiAnalytics?: IAiAnalytics;
}

/**
 * Writes one log line for a rating (JEF-547) and sends a PostHog event on its trace (JEF-569). Both carry the same
 * bounded fields (feature, rating, reason, model, prompt version, source) and
 * nothing the user wrote. The log line is the audit trail in the API's own logs;
 * the counter and dashboards moved to PostHog (JEF-571, `docs/observability.md`).
 * Never throws: a broken logger must not undo a rating.
 */
export class AiFeedbackObserver implements IAiFeedbackObserver {
  private readonly logger: ILogger;
  private readonly aiAnalytics: IAiAnalytics | undefined;

  constructor({ logger, aiAnalytics }: Deps) {
    this.logger = logger;
    this.aiAnalytics = aiAnalytics;
  }

  rated(event: AiFeedbackEvent): void {
    try {
      this.logger.info('AI output rated', {
        event: AI_FEEDBACK_LOG_EVENT,
        feature: event.feature,
        rating: event.rating,
        reason: event.reason,
        provider: event.generation?.provider ?? null,
        model: event.generation?.model ?? null,
        prompt_version: event.generation?.promptVersion ?? null,
        source: event.generation?.source ?? null,
        tier: event.generation?.tier ?? null,
      });
    } catch {
      // Observability is best effort.
    }
    this.send(event, 'feedback');
  }

  cleared(event: AiFeedbackEvent): void {
    this.send(event, 'feedbackCleared');
  }

  /** Its own guard, so a PostHog failure cannot undo a rating. */
  private send(event: AiFeedbackEvent, method: 'feedback' | 'feedbackCleared'): void {
    try {
      this.aiAnalytics?.[method]({
        userId: event.userId,
        traceId: event.generation?.traceId ?? null,
        feature: event.feature,
        rating: event.rating,
        reason: event.reason,
        provider: event.generation?.provider ?? null,
        model: event.generation?.model ?? null,
        promptVersion:
          event.generation?.promptVersion != null ? String(event.generation.promptVersion) : null,
        source: event.generation?.source ?? null,
        tier: event.generation?.tier ?? null,
      });
    } catch {
      // Analytics is best effort.
    }
  }
}
