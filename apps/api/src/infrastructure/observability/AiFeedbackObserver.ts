import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type {
  AiFeedbackEvent,
  IAiFeedbackObserver,
} from '#src/use-cases/ports/IAiFeedbackObserver.js';

/** The `fields.event` of the log line, for Axiom queries (see `observability/CLAUDE.md`). */
export const AI_FEEDBACK_LOG_EVENT = 'ai.feedback.rated';

interface Deps {
  logger: ILogger;
}

/**
 * Writes one log line for a rating (JEF-547): bounded fields (feature, rating,
 * reason, model, prompt version, source) and nothing the user wrote. It is the
 * audit trail in the API's own logs; the counter and dashboards moved to PostHog
 * (JEF-571, `docs/observability.md`). Never throws: a broken logger must not undo
 * a rating.
 */
export class AiFeedbackObserver implements IAiFeedbackObserver {
  private readonly logger: ILogger;

  constructor({ logger }: Deps) {
    this.logger = logger;
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
  }
}
