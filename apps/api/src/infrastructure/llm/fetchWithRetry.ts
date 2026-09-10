import { LLM } from '#src/use-cases/constants.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The wait a `Retry-After` header asks for, in milliseconds, when it is
 * present, parseable (delta-seconds or an HTTP-date) and no longer than
 * `LLM.RETRY_AFTER_MAX_MS`; `null` otherwise. Mocked responses in tests
 * may have no `headers` at all, hence the optional chaining.
 */
export function retryAfterDelayMs(response: Pick<Response, 'headers'>): number | null {
  const raw = response.headers?.get?.('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw) - Date.now();
  if (!Number.isFinite(ms) || ms < 0 || ms > LLM.RETRY_AFTER_MAX_MS) return null;
  return ms;
}

/**
 * `fetch()` with a per-attempt timeout and a small bounded retry for
 * transient failures — network errors (including our own timeout) and 5xx
 * responses. A 4xx response (bad API key, bad request) is returned
 * immediately without retrying, so it fails fast and surfaces clearly
 * rather than being masked by a retry loop.
 *
 * `externalSignal` lets a caller cancel the whole call chain independent of
 * the per-attempt timeout, combined via `AbortSignal.any` so either one
 * aborts the in-flight `fetch`. Already-aborted (or aborted between
 * attempts) skips straight to throwing rather than burning a retry against
 * a caller that's already gone.
 *
 * `perAttemptTimeoutMs` defaults to `LLM.REQUEST_TIMEOUT_MS` for the normal
 * one-shot case. Pass `null` to skip the internal `AbortSignal.timeout`
 * entirely and rely solely on `externalSignal` — used by streaming callers,
 * which pass an idle-reset signal (see `createIdleAbortController`) instead:
 * a fixed-duration timeout stays attached to the whole request including the
 * body read, so it would abort a healthy, actively-streaming response that
 * simply runs longer than one request "should."
 *
 * Callers keep their own response-handling code unchanged: this only
 * decides whether to retry the transport-level call, then returns the
 * final `Response` (ok or not) or rethrows the final network/abort error.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  externalSignal?: AbortSignal,
  perAttemptTimeoutMs: number | null = LLM.REQUEST_TIMEOUT_MS,
): Promise<Response> {
  if (externalSignal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= LLM.MAX_RETRIES; attempt++) {
    const timeoutSignal =
      perAttemptTimeoutMs === null ? undefined : AbortSignal.timeout(perAttemptTimeoutMs);
    const signal =
      timeoutSignal && externalSignal
        ? AbortSignal.any([timeoutSignal, externalSignal])
        : (timeoutSignal ?? externalSignal);
    let delayMs = LLM.RETRY_BACKOFF_BASE_MS * 2 ** attempt;
    try {
      const response = await fetch(url, { ...init, signal });
      if (response.ok || attempt === LLM.MAX_RETRIES) return response;
      // A 429 is only worth retrying when the provider says how soon (F7);
      // a 503 with a Retry-After waits that long instead of guessing.
      const retryAfterMs = retryAfterDelayMs(response);
      if (response.status === 429) {
        if (retryAfterMs === null) return response;
        delayMs = retryAfterMs;
      } else if (response.status < 500) {
        return response;
      } else if (retryAfterMs !== null) {
        delayMs = retryAfterMs;
      }
      lastError = new Error(`Upstream returned ${response.status}`);
    } catch (err) {
      lastError = err;
      if (attempt === LLM.MAX_RETRIES || externalSignal?.aborted) throw err;
    }
    await sleep(delayMs);
  }

  // Unreachable: the loop above always returns or throws by the final
  // attempt. Present only so TypeScript can see every path returns.
  throw lastError;
}

/**
 * Idle-reset abort signal for a streaming fetch (JEF-239 follow-up). Unlike
 * `AbortSignal.timeout()`, which fires a fixed duration after creation
 * regardless of what's happening on the wire, this only aborts once
 * `idleMs` passes with no `activity()` call — call it on every chunk
 * received so an actively-flowing stream is never cut off, while a
 * connection that goes quiet (including a hung connect, before the first
 * chunk) still gets caught.
 *
 * `externalSignal` — typically a client-disconnect signal — aborts the
 * returned controller immediately, same as `fetchWithRetry`'s own handling.
 * Callers must call `dispose()` once the stream ends (success or error) to
 * clear the pending timer.
 */
export function createIdleAbortController(
  idleMs: number,
  externalSignal?: AbortSignal,
): { signal: AbortSignal; activity: () => void; dispose: () => void } {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const dispose = () => clearTimeout(timer);

  const activity = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      controller.abort(
        new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
      );
    }, idleMs);
  };

  if (externalSignal?.aborted) {
    controller.abort(externalSignal.reason);
  } else {
    externalSignal?.addEventListener('abort', () => {
      dispose();
      controller.abort(externalSignal.reason);
    });
    activity();
  }

  return { signal: controller.signal, activity, dispose };
}
