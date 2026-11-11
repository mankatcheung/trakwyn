import { otelMetrics, type IMetrics } from '#src/infrastructure/observability/metrics.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type {
  AiFeedbackEvent,
  IAiFeedbackObserver,
} from '#src/use-cases/ports/IAiFeedbackObserver.js';

/** The `fields.event` of the log line, for Axiom queries (see `observability/CLAUDE.md`). */
export const AI_FEEDBACK_LOG_EVENT = 'ai.feedback.rated';

interface Deps {
  logger: ILogger;
  metrics?: IMetrics;
}

/**
 * Counts a rating and writes one log line for it (JEF-547). Both carry the same
 * bounded fields (feature, rating, reason, model, prompt version, source) and
 * nothing the user wrote, so they sit beside telemetry that keeps prompt and
 * completion text out. Never throws: a broken metric must not undo a rating.
 */
export class AiFeedbackObserver implements IAiFeedbackObserver {
  private readonly logger: ILogger;
  private readonly metrics: IMetrics;

  constructor({ logger, metrics = otelMetrics }: Deps) {
    this.logger = logger;
    this.metrics = metrics;
  }

  rated(event: AiFeedbackEvent): void {
    try {
      this.metrics.recordAiFeedback(event);
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
