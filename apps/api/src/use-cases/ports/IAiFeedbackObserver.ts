import type { AiGeneration } from '#src/domain/aiFeedback/AiFeedback.js';

/** What the observer is told when a user rates AI output (JEF-547). No text, ever. */
export interface AiFeedbackEvent {
  /** The Trakwyn user id; the PostHog adapter pseudonymises it. */
  userId: string;
  feature: string;
  rating: string;
  reason: string | null;
  generation: AiGeneration | null;
}

/**
 * Records a rating as a metric, a log line and a PostHog event, so a monthly look at down-votes
 * names the feature, model and prompt version to write eval cases for. A port
 * because use cases may not import the metrics adapter.
 */
export interface IAiFeedbackObserver {
  rated(event: AiFeedbackEvent): void;
  /** A rating was taken back (JEF-569); carries the fields of the rating that was removed. */
  cleared(event: AiFeedbackEvent): void;
}
