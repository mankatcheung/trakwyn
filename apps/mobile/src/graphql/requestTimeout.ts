import { addBreadcrumb } from '../lib/analytics';

/**
 * A GraphQL request that got no answer within `GQL_REQUEST_TIMEOUT_MS`
 * (JEF-367).
 *
 * A `TypeError`, because that is what a request that never reached the
 * server looks like everywhere else in the app: `getErrorMessage` shows the
 * network message for it, and a refresh that times out reads as
 * "unreachable" rather than as a rejected session.
 */
export class RequestTimeoutError extends TypeError {
  constructor(public readonly operation: string) {
    super(`GraphQL request ${operation} timed out`);
    this.name = 'RequestTimeoutError';
  }
}

const OPERATION_NAME = /\b(?:query|mutation|subscription)\s+([_A-Za-z][_0-9A-Za-z]*)/;

/**
 * The operation's declared name (`Me` for `query Me { … }`), or
 * `anonymous`. Only the name — a fixed identifier from the app's own
 * source — ever reaches a breadcrumb, never the variables.
 */
export function operationName(query: string): string {
  return OPERATION_NAME.exec(query)?.[1] ?? 'anonymous';
}

/**
 * Runs `send` with a signal that aborts after `timeoutMs`, and turns that
 * abort into a `RequestTimeoutError` with a breadcrumb naming the operation.
 *
 * Without it a request on a dead connection hangs until the OS gives up —
 * often a minute or more — behind a spinner, and leaves nothing behind.
 *
 * An AbortController and a timer rather than `AbortSignal.timeout()`, which
 * React Native does not reliably provide; the timer is cleared as soon as
 * the request settles.
 */
export async function withRequestTimeout<T>(
  query: string,
  timeoutMs: number,
  send: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await send(controller.signal);
  } catch (error) {
    if (!timedOut) throw error;
    const operation = operationName(query);
    addBreadcrumb('Request timed out', { operation });
    throw new RequestTimeoutError(operation);
  } finally {
    clearTimeout(timer);
  }
}
