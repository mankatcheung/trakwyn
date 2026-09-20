export interface ILogger {
  /**
   * `err` is optional: a log line that is its own explanation (the id is in
   * the message) has nothing to attach, and whatever is passed here is
   * reduced to an allow-list of error fields before it reaches a log —
   * `infrastructure/observability/serializeLoggedError.ts` has the why.
   */
  error(message: string, err?: unknown): void;
  /**
   * Something degraded but the request carried on — a circuit breaker
   * opening, a fail-open path being taken (JEF-351). Same optional `err`,
   * and for the same reason: the interesting warnings are often state
   * changes with nothing thrown.
   */
  warn(message: string, err?: unknown): void;
}
