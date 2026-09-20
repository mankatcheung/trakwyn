/**
 * Fields attached to a log line. Scalars only, and a closed set chosen by the
 * caller: whatever is passed here reaches Axiom verbatim, so a raw IP address,
 * a full URL or anything a user typed does not belong in one (JEF-348).
 */
export type LogFields = Record<string, string | number | boolean>;

export interface ILogger {
  /**
   * `err` is optional: a log line that is its own explanation (the id is in
   * the message) has nothing to attach, and whatever is passed here is
   * reduced to an allow-list of error fields before it reaches a log —
   * `infrastructure/observability/serializeLoggedError.ts` has the why.
   */
  error(message: string, err?: unknown): void;
  /**
   * Something worth alerting on that is not a server fault — a rate limiter
   * or the outbound-URL policy refusing a request (JEF-350). The mechanism
   * worked, so it is not an error; nobody finding out is the problem `warn`
   * solves.
   */
  warn(message: string, fields?: LogFields): void;
}
