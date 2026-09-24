export interface ShutdownDeps {
  /** Stops accepting connections and resolves once in-flight requests finish — `fastify.close()`. */
  closeServer: () => Promise<void>;
  /** Flushes and closes the telemetry pipelines — never rejects. */
  shutdownTelemetry: () => Promise<void>;
  exit: (code: number) => void;
  logError: (err: unknown) => void;
  /** How long to wait for in-flight requests before giving up on them. */
  closeTimeoutMs: number;
}

const CLOSE_TIMED_OUT = Symbol('close timed out');

/**
 * Builds the SIGTERM/SIGINT handler for the API process.
 *
 * Cloud Run sends SIGTERM when it scales an instance in or rolls out a new
 * revision, then SIGKILLs it 10 seconds later. The order matters: the server
 * stops taking requests and drains first, so the telemetry shut down after it
 * includes those last requests' spans and logs. Draining is capped by
 * `closeTimeoutMs` because a chat SSE stream can stay open for minutes — waiting
 * on it would spend the whole grace period and lose the telemetry flush too.
 *
 * Idempotent: a second signal while shutting down is ignored rather than
 * starting a second drain.
 */
export function createShutdownHandler(deps: ShutdownDeps): () => Promise<void> {
  let shuttingDown: Promise<void> | undefined;

  const run = async (): Promise<void> => {
    let exitCode = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const timedOut = new Promise<typeof CLOSE_TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(CLOSE_TIMED_OUT), deps.closeTimeoutMs);
      });
      const outcome = await Promise.race([deps.closeServer(), timedOut]);
      if (outcome === CLOSE_TIMED_OUT) {
        deps.logError(`Server did not close within ${deps.closeTimeoutMs}ms; exiting anyway.`);
        exitCode = 1;
      }
    } catch (err: unknown) {
      deps.logError(err);
      exitCode = 1;
    } finally {
      clearTimeout(timer);
    }

    await deps.shutdownTelemetry();
    deps.exit(exitCode);
  };

  return () => {
    shuttingDown ??= run();
    return shuttingDown;
  };
}
