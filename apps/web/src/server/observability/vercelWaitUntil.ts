/**
 * Vercel's `waitUntil`: keeps the function alive until `promise` settles,
 * even after the response has been sent.
 *
 * This is the whole of what `@vercel/functions`' `waitUntil` does — look up
 * the request context the Vercel runtime publishes on a global symbol — kept
 * here rather than added as a dependency, because adding any dependency to
 * this package re-resolves its `latest`-pinned TanStack packages too.
 *
 * Outside Vercel (dev, tests, `vite preview`) there is no context and this is
 * a no-op: the promise simply runs to completion in the live process.
 */
const VERCEL_REQUEST_CONTEXT = Symbol.for('@vercel/request-context');

interface VercelRequestContext {
  waitUntil?: (promise: Promise<unknown>) => void;
}

interface VercelContextHolder {
  get?: () => VercelRequestContext | undefined;
}

export function vercelWaitUntil(promise: Promise<unknown>): void {
  const holder = (globalThis as Record<symbol, VercelContextHolder | undefined>)[
    VERCEL_REQUEST_CONTEXT
  ];
  holder?.get?.()?.waitUntil?.(promise);
}
