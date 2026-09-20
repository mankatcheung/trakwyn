/**
 * Structured fields attached to one log line.
 *
 * Primitives only, and facts about what happened — never credentials, tokens
 * or personal data. Logs outlive the records they would be copied from:
 * `SecurityEvent` and `LoginEvent` are deleted with the user, a log line is
 * not. The same reasoning as `serializeLoggedError.ts`, applied to the fields
 * a caller chooses rather than the ones an error carries.
 */
export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface ILogger {
  /**
   * `err` is optional: a log line that is its own explanation (the id is in
   * the message) has nothing to attach, and whatever is passed here is
   * reduced to an allow-list of error fields before it reaches a log —
   * `infrastructure/observability/serializeLoggedError.ts` has the why.
   *
   * `message` stays a human sentence, since most call sites report a caught
   * error rather than a named event. A line that also belongs to a queryable
   * event puts the dotted name in `fields.event` itself.
   */
  error(message: string, err?: unknown, fields?: LogFields): void;
  /** Takes the dotted event name (`job.digest.misconfigured`) and records it as the `event` field. */
  warn(event: string, fields?: LogFields): void;
  /** Takes the dotted event name (`job.digest.completed`) and records it as the `event` field. */
  info(event: string, fields?: LogFields): void;
}
