export interface ILogger {
  /**
   * `err` is optional: a log line that is its own explanation (the id is in
   * the message) has nothing to attach, and whatever is passed here is
   * reduced to an allow-list of error fields before it reaches a log —
   * `infrastructure/observability/serializeLoggedError.ts` has the why.
   */
  error(message: string, err?: unknown): void;
}
