import { describe, expect, it, vi } from 'vitest';

const { createCsrfMiddleware, createStart } = vi.hoisted(() => ({
  createCsrfMiddleware: vi.fn((options: unknown) => ({ kind: 'csrf', options })),
  createStart: vi.fn((getOptions: () => unknown) => ({ getOptions })),
}));

vi.mock('@tanstack/react-start', () => ({
  createCsrfMiddleware,
  createStart,
  createServerOnlyFn: (fn: unknown) => fn,
  createMiddleware: () => ({ server: (fn: unknown) => ({ kind: 'function', server: fn }) }),
}));

import { startInstance } from '#/start';

interface StartOptions {
  requestMiddleware: {
    kind: string;
    options?: { filter: (ctx: { handlerType: string }) => boolean };
  }[];
  functionMiddleware: { kind: string }[];
}

describe('startInstance', () => {
  const options = (startInstance as unknown as { getOptions: () => StartOptions }).getOptions();

  // Declaring requestMiddleware replaces TanStack's built-in CSRF check for
  // server functions; losing it would open getRequiresCookieConsent to
  // cross-site calls.
  it('keeps the CSRF check TanStack applies to server functions by default', () => {
    const [csrf] = options.requestMiddleware;
    expect(csrf.kind).toBe('csrf');
    expect(csrf.options?.filter({ handlerType: 'serverFn' })).toBe(true);
    expect(csrf.options?.filter({ handlerType: 'router' })).toBe(false);
  });

  it('reports server function errors through a function middleware', () => {
    expect(options.functionMiddleware).toHaveLength(1);
    expect(options.functionMiddleware[0].kind).toBe('function');
  });
});
