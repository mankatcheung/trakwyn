import { afterEach, describe, expect, it, vi } from 'vitest';
import { vercelWaitUntil } from '#/server/observability/vercelWaitUntil';

const CONTEXT = Symbol.for('@vercel/request-context');
const globals = globalThis as Record<symbol, unknown>;

describe('vercelWaitUntil', () => {
  afterEach(() => {
    delete globals[CONTEXT];
  });

  it("hands the promise to the Vercel runtime's request context", () => {
    const waitUntil = vi.fn();
    globals[CONTEXT] = { get: () => ({ waitUntil }) };
    const promise = Promise.resolve();

    vercelWaitUntil(promise);

    expect(waitUntil).toHaveBeenCalledWith(promise);
  });

  it('is a no-op outside Vercel', () => {
    expect(() => vercelWaitUntil(Promise.resolve())).not.toThrow();
  });

  it('is a no-op when the context has no waitUntil', () => {
    globals[CONTEXT] = { get: () => undefined };
    expect(() => vercelWaitUntil(Promise.resolve())).not.toThrow();
  });
});
