import { describe, expect, it, vi } from 'vitest';
import { notFound, redirect } from '@tanstack/react-router';
import {
  installRenderErrorCapture,
  RENDER_ERROR_PREFIX,
  reportServerFnErrors,
  withRenderReporting,
  withRequestReporting,
} from '#/server/observability/reportServerErrors';
import type { ServerLogger } from '#/server/observability/serverLogger';

function fakeLogger() {
  const error = vi.fn<ServerLogger['error']>(async () => undefined);
  return { logger: { error } satisfies ServerLogger, error };
}

function request(url = 'https://www.trakwyn.com/share?token=SHARE-TOKEN'): Request {
  return new Request(url);
}

function aborted(): Request {
  const controller = new AbortController();
  controller.abort();
  return new Request('https://www.trakwyn.com/share', { signal: controller.signal });
}

function handlerCtx(
  matches: { routeId: string; status: string; error?: unknown }[],
  req = request(),
) {
  return { request: req, router: { state: { matches } } };
}

describe('withRenderReporting', () => {
  it('reports each errored match as a load failure, then renders', async () => {
    const { logger, error } = fakeLogger();
    const loaderError = new Error('loader failed');
    const render = vi.fn(async () => 'response');

    const result = await withRenderReporting(
      render,
      () => logger,
    )(
      handlerCtx([
        { routeId: '__root__', status: 'success' },
        { routeId: '/share', status: 'error', error: loaderError },
      ]),
    );

    expect(result).toBe('response');
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      'web.ssr.failed',
      expect.objectContaining({ phase: 'load', routeId: '/share', 'url.path': '/share' }),
      loaderError,
    );
  });

  it('does not report a redirect or not-found as a failure', async () => {
    const { logger, error } = fakeLogger();

    await withRenderReporting(
      async () => 'ok',
      () => logger,
    )(
      handlerCtx([
        { routeId: '/a', status: 'error', error: redirect({ to: '/login' }) },
        { routeId: '/b', status: 'error', error: notFound() },
      ]),
    );

    expect(error).not.toHaveBeenCalled();
  });

  it('reports a shell render failure and rethrows the original error', async () => {
    const { logger, error } = fakeLogger();
    const shellError = new Error('shell failed');

    await expect(
      withRenderReporting(
        async () => {
          throw shellError;
        },
        () => logger,
      )(handlerCtx([{ routeId: '/verify-email', status: 'success' }])),
    ).rejects.toBe(shellError);

    expect(error).toHaveBeenCalledWith(
      'web.ssr.failed',
      expect.objectContaining({ phase: 'shell', routeId: '/verify-email' }),
      shellError,
    );
  });

  it('does not report a render the client abandoned', async () => {
    const { logger, error } = fakeLogger();

    await expect(
      withRenderReporting(
        async () => {
          throw new Error('aborted');
        },
        () => logger,
      )(handlerCtx([], aborted())),
    ).rejects.toThrow('aborted');

    expect(error).not.toHaveBeenCalled();
  });

  it('skips a loader error a server function already reported', async () => {
    const { logger, error } = fakeLogger();
    const fnError = new Error('fn failed');
    await expect(
      reportServerFnErrors(() => logger)({
        next: async () => {
          throw fnError;
        },
        method: 'GET',
        serverFnMeta: { name: 'fn', filename: 'src/lib/fn.ts' },
      }),
    ).rejects.toBe(fnError);

    await withRenderReporting(
      async () => 'ok',
      () => logger,
    )(handlerCtx([{ routeId: '/share', status: 'error', error: fnError }]));

    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0][0]).toBe('web.server_fn.failed');
  });
});

describe('withRequestReporting', () => {
  it('reports an uncaught error as a request failure and rethrows it', async () => {
    const { logger, error } = fakeLogger();
    const failure = new Error('manifest missing');

    await expect(
      withRequestReporting(
        async (_req: Request) => {
          throw failure;
        },
        () => logger,
      )(request()),
    ).rejects.toBe(failure);

    expect(error).toHaveBeenCalledWith(
      'web.request.failed',
      expect.objectContaining({ 'url.path': '/share' }),
      failure,
    );
  });

  it('does not report again an error the render layer already reported', async () => {
    const { logger, error } = fakeLogger();
    const shellError = new Error('shell failed');
    const render = withRenderReporting(
      async () => {
        throw shellError;
      },
      () => logger,
    );

    await expect(
      withRequestReporting(
        async (req: Request) => render(handlerCtx([], req)),
        () => logger,
      )(request()),
    ).rejects.toBe(shellError);

    expect(error).toHaveBeenCalledOnce();
  });

  it('passes a successful response through untouched', async () => {
    const { logger, error } = fakeLogger();
    const response = new Response('ok');

    await expect(
      withRequestReporting(
        async (_req: Request) => response,
        () => logger,
      )(request()),
    ).resolves.toBe(response);
    expect(error).not.toHaveBeenCalled();
  });

  it('does not report a request the client abandoned', async () => {
    const { logger, error } = fakeLogger();

    await expect(
      withRequestReporting(
        async (_req: Request) => {
          throw new Error('aborted');
        },
        () => logger,
      )(aborted()),
    ).rejects.toThrow();

    expect(error).not.toHaveBeenCalled();
  });
});

describe('reportServerFnErrors', () => {
  it('reports the function by name and file, and rethrows for the client', async () => {
    const { logger, error } = fakeLogger();
    const failure = new Error('lookup failed');

    await expect(
      reportServerFnErrors(() => logger)({
        next: async () => {
          throw failure;
        },
        method: 'GET',
        serverFnMeta: { name: 'getRequiresCookieConsent', filename: 'src/lib/consentRegion.ts' },
      }),
    ).rejects.toBe(failure);

    expect(error).toHaveBeenCalledWith(
      'web.server_fn.failed',
      {
        'server_fn.name': 'getRequiresCookieConsent',
        'server_fn.file': 'src/lib/consentRegion.ts',
        'http.method': 'GET',
      },
      failure,
    );
  });

  it('returns the result of a successful call unchanged', async () => {
    const { logger, error } = fakeLogger();
    const result = { result: true };

    await expect(
      reportServerFnErrors(() => logger)({
        next: async () => result,
        method: 'GET',
        serverFnMeta: { name: 'fn', filename: 'f.ts' },
      }),
    ).resolves.toBe(result);
    expect(error).not.toHaveBeenCalled();
  });

  it('does not report a redirect thrown as control flow', async () => {
    const { logger, error } = fakeLogger();

    await expect(
      reportServerFnErrors(() => logger)({
        next: async () => {
          throw redirect({ to: '/login' });
        },
        method: 'POST',
        serverFnMeta: { name: 'fn', filename: 'f.ts' },
      }),
    ).rejects.toBeDefined();
    expect(error).not.toHaveBeenCalled();
  });
});

describe('installRenderErrorCapture', () => {
  function install(getRequest: () => Request | undefined = () => request()) {
    const { logger, error } = fakeLogger();
    const original = vi.fn();
    const target = { error: original as Console['error'] };
    const keepAlive = vi.fn();
    const uninstall = installRenderErrorCapture({
      getLogger: () => logger,
      getRequest,
      keepAlive,
      target,
    });
    return { target, original, error, keepAlive, uninstall };
  }

  it("reports React's onError call as a render failure and keeps the function alive for it", () => {
    const { target, original, error, keepAlive } = install();
    const renderError = new Error('component failed');

    target.error('Error in renderToReadableStream:', renderError, { componentStack: '' });

    expect(original).toHaveBeenCalledWith('Error in renderToReadableStream:', renderError, {
      componentStack: '',
    });
    expect(error).toHaveBeenCalledWith(
      'web.ssr.failed',
      expect.objectContaining({ phase: 'render', 'url.path': '/share' }),
      renderError,
    );
    expect(keepAlive).toHaveBeenCalledOnce();
  });

  it('matches the pipeable-stream renderer as well', () => {
    const { target, error } = install();

    target.error('Error in renderToPipeableStream:', new Error('x'));

    expect(error).toHaveBeenCalledOnce();
  });

  it('leaves every other console.error alone', () => {
    const { target, original, error, keepAlive } = install();

    target.error('Server Fn Error!', new Error('x'));
    target.error(new Error('bare'));

    expect(original).toHaveBeenCalledTimes(2);
    expect(error).not.toHaveBeenCalled();
    expect(keepAlive).not.toHaveBeenCalled();
  });

  it('reports without request fields outside a request context', () => {
    const { target, error } = install(() => {
      throw new Error('no start context');
    });

    target.error('Error in renderToReadableStream:', new Error('x'));

    expect(error).toHaveBeenCalledWith('web.ssr.failed', { phase: 'render' }, expect.any(Error));
  });

  it('reports the same error object once', () => {
    const { target, error } = install();
    const renderError = new Error('x');

    target.error('Error in renderToReadableStream:', renderError);
    target.error('Error in renderToReadableStream:', renderError);

    expect(error).toHaveBeenCalledOnce();
  });

  it('restores the original console.error on uninstall', () => {
    const { target, original, uninstall } = install();

    uninstall();

    expect(target.error).toBe(original);
  });
});

describe('TanStack render error hook (drift guard)', () => {
  it("still forwards React's onError through a console.error with the expected prefix", async () => {
    // installRenderErrorCapture depends on this call's shape; if TanStack
    // changes it, render errors silently stop reaching PostHog. Reads the
    // installed source rather than trusting the version number.
    const { readFileSync } = await import('node:fs');
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const routerEntry = require.resolve('@tanstack/react-router');
    const packageRoot = routerEntry.slice(0, routerEntry.lastIndexOf('/dist/'));
    const source = readFileSync(`${packageRoot}/dist/esm/ssr/renderRouterToStream.js`, 'utf8');

    expect(source).toContain('console.error(`Error in ${renderer}:`, error');
    expect(source).toContain('onError("renderToReadableStream")');
    expect(`Error in renderToReadableStream`.startsWith(RENDER_ERROR_PREFIX)).toBe(true);
  });
});
