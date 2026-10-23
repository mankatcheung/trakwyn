import { describe, it, expect, vi } from 'vitest';

vi.mock('#/graphql/client', () => ({ gqlClient: {} }));

interface LoaderOpts {
  context: { queryClient: { ensureQueryData: (options: unknown) => Promise<unknown> } };
}

async function loadLoader(): Promise<(opts: LoaderOpts) => Promise<unknown>> {
  const mod = await import('#/routes/_authenticated/offers');
  // The generated Route type hides its own options object; reach past it.
  const route = mod.Route as unknown as {
    options?: { loader?: (opts: LoaderOpts) => Promise<unknown> };
    loader?: (opts: LoaderOpts) => Promise<unknown>;
  };
  const loader = route.options?.loader ?? route.loader;
  if (!loader) throw new Error('loader not found');
  return loader;
}

const gqlError = (code: string) => ({
  response: { errors: [{ message: 'nope', extensions: { code } }] },
});

const run = async (ensureQueryData: LoaderOpts['context']['queryClient']['ensureQueryData']) =>
  (await loadLoader())({ context: { queryClient: { ensureQueryData } } });

describe('the offers route loader (JEF-344)', () => {
  it('lets the page render when the offers need Pro, so it can show the upgrade prompt in the app shell', async () => {
    await expect(run(vi.fn().mockRejectedValue(gqlError('PLAN_REQUIRED')))).resolves.not.toThrow();
  });

  it('still fails the route for any other error', async () => {
    const error = gqlError('INTERNAL_ERROR');

    await expect(run(vi.fn().mockRejectedValue(error))).rejects.toBe(error);
  });

  it('still fails the route for an error with no code at all', async () => {
    const error = new TypeError('Failed to fetch');

    await expect(run(vi.fn().mockRejectedValue(error))).rejects.toBe(error);
  });

  it('is happy with offers it could load', async () => {
    await expect(run(vi.fn().mockResolvedValue([]))).resolves.not.toThrow();
  });
});
