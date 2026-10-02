import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Browser } from 'wxt/browser';
import {
  captureEvent,
  captureException,
  initObservability,
  markReported,
  resetObservabilityForTests,
  wasReported,
} from './report';
import { rememberTraceId, resetTraceContext } from './traceContext';
import { EXTENSION_CONTEXTS, OBSERVABILITY_EVENTS } from '../../constants';

const KEY = 'phc_test_key';
const fetchMock = vi.fn();

interface Capture {
  url: string;
  init: RequestInit;
  body: {
    api_key: string;
    event: string;
    distinct_id: string;
    timestamp: string;
    properties: Record<string, unknown>;
  };
}

function captures(): Capture[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: url as string,
    init: init as RequestInit,
    body: JSON.parse((init as RequestInit).body as string),
  }));
}

beforeEach(() => {
  fakeBrowser.reset();
  fetchMock.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({
    version: '1.2.3',
  } as Browser.runtime.Manifest);
  resetObservabilityForTests();
  resetTraceContext();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('without VITE_POSTHOG_KEY', () => {
  it('sends nothing', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '');

    await captureException(new Error('boom'));
    await captureEvent(OBSERVABILITY_EVENTS.PARSER_RESULT, { board: 'linkedin' });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('with VITE_POSTHOG_KEY', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_POSTHOG_KEY', KEY);
    vi.stubEnv('VITE_POSTHOG_HOST', '');
  });

  it("posts an exception to PostHog's EU capture endpoint as $exception", async () => {
    initObservability(EXTENSION_CONTEXTS.BACKGROUND);
    const error = new TypeError('boom');

    await captureException(error, { action: 'save_application' });

    const [{ url, init, body }] = captures();
    expect(url).toBe('https://eu.i.posthog.com/i/v0/e/');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(body.api_key).toBe(KEY);
    expect(body.event).toBe('$exception');
    expect(body.properties).toMatchObject({
      $lib: 'trakwyn-extension',
      context: 'background',
      release: '1.2.3',
      action: 'save_application',
      $exception_level: 'error',
    });
    const [entry] = body.properties.$exception_list as Array<Record<string, unknown>>;
    expect(entry).toMatchObject({ type: 'TypeError', value: 'boom' });
    expect(entry.mechanism).toMatchObject({ handled: true });
  });

  it('uses the configured host, without a doubled slash', async () => {
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://ph.example.com/');

    await captureEvent(OBSERVABILITY_EVENTS.PARSER_RESULT);

    expect(captures()[0].url).toBe('https://ph.example.com/i/v0/e/');
  });

  it('creates no person: no profile, no GeoIP, and a fresh distinct_id per event', async () => {
    await captureEvent(OBSERVABILITY_EVENTS.PARSER_RESULT);
    await captureEvent(OBSERVABILITY_EVENTS.PARSER_RESULT);

    const [first, second] = captures();
    expect(first.body.properties.$process_person_profile).toBe(false);
    expect(first.body.properties.$geoip_disable).toBe(true);
    expect(first.body.distinct_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.body.distinct_id).not.toBe(first.body.distinct_id);
  });

  it('never sends a traceparent, which is for the API only', async () => {
    rememberTraceId('a'.repeat(32));

    await captureException(new Error('boom'));

    const [{ init, body }] = captures();
    expect(Object.keys(init.headers as Record<string, string>)).toEqual(['Content-Type']);
    // The id still travels as a property, to find the trace in Axiom.
    expect(body.properties.trace_id).toBe('a'.repeat(32));
  });

  it('scrubs properties, the message and the stack', async () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2ln';
    const error = new Error(`Rejected ${jwt} for ada@example.com`);
    error.stack = `Error: Rejected ${jwt}\n    at run (https://x.chromiumapp.org/?code=handoff-123:1:2)`;

    await captureException(error, {
      refreshToken: 'refresh-secret',
      email: 'ada@example.com',
      description: 'We are hiring a…',
      detail: 'https://x.chromiumapp.org/?code=handoff-123',
    });

    const sent = JSON.stringify(captures()[0].body.properties);
    expect(sent).not.toContain(jwt);
    expect(sent).not.toContain('ada@example.com');
    expect(sent).not.toContain('refresh-secret');
    expect(sent).not.toContain('hiring');
    expect(sent).not.toContain('handoff-123');
  });

  it('reports a non-Error throw by its type, never its value', async () => {
    await captureException('user typed this');

    const sent = JSON.stringify(captures()[0].body.properties);
    expect(sent).toContain('A non-Error string was thrown');
    expect(sent).not.toContain('user typed this');
  });

  it('reports the same error once', async () => {
    const error = new Error('boom');

    await captureException(error);
    await captureException(error);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips an error another layer marked as reported', async () => {
    const error = new Error('boom');
    markReported(error);

    await captureException(error);

    expect(wasReported(error)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops a report that fails, without throwing or retrying', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(captureException(new Error('boom'))).resolves.toBeUndefined();
    await expect(captureEvent(OBSERVABILITY_EVENTS.PARSER_RESULT)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('survives a manifest that cannot be read', async () => {
    vi.spyOn(fakeBrowser.runtime, 'getManifest').mockImplementation(() => {
      throw new Error('no manifest');
    });

    await captureEvent(OBSERVABILITY_EVENTS.PARSER_RESULT);

    expect(captures()[0].body.properties).not.toHaveProperty('release');
  });

  describe('initObservability', () => {
    it('reports uncaught errors and unhandled rejections as unhandled', async () => {
      initObservability(EXTENSION_CONTEXTS.POPUP);

      globalThis.dispatchEvent(new ErrorEvent('error', { error: new Error('uncaught') }));
      globalThis.dispatchEvent(
        Object.assign(new Event('unhandledrejection'), { reason: new Error('rejected') }),
      );
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

      const values = captures().map(({ body }) => {
        const [entry] = body.properties.$exception_list as Array<{
          value: string;
          mechanism: { handled: boolean };
        }>;
        expect(entry.mechanism.handled).toBe(false);
        expect(body.properties.context).toBe('popup');
        return entry.value;
      });
      expect(values).toEqual(['uncaught', 'rejected']);
    });
  });
});
