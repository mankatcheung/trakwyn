/**
 * Structured fields attached to one log line, beside the message.
 *
 * Primitives only, and facts about what happened — never credentials, tokens
 * or personal data. Logs outlive the records they would be copied from:
 * `SecurityEvent` and `LoginEvent` are deleted with the user, a log line is
 * not. The same reasoning as `serializeLoggedError.ts`, applied to the fields
 * a caller chooses rather than the ones an error carries.
 *
 * A line that a dashboard or alert should be able to group on carries a
 * stable dotted name as `fields.event` (`job.digest.completed`). That is a
 * field like any other rather than a separate parameter, so the three methods
 * keep one shape.
 */
export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface ILogger {
  /**
   * `err` is optional: a log line that is its own explanation (the id is in
   * the message) has nothing to attach, and whatever is passed here is
   * reduced to an allow-list of error fields before it reaches a log —
   * `infrastructure/observability/serializeLoggedError.ts` has the why.
   */
  error(message: string, err?: unknown, fields?: LogFields): void;
  /**
   * Something degraded but the request carried on — a circuit breaker
   * opening, a fail-open path being taken (JEF-351). Same optional `err`,
   * and for the same reason: the interesting warnings are often state
   * changes with nothing thrown.
   */
  warn(message: string, err?: unknown, fields?: LogFields): void;
  /**
   * Normal activity worth keeping as a record — the summary line each
   * scheduled job run emits (JEF-352). No `err` parameter: an info line has
   * nothing thrown behind it, or it would not be one.
   */
  info(message: string, fields?: LogFields): void;
}
