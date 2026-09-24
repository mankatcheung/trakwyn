import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPosthog } = vi.hoisted(() => ({
  mockPosthog: {
    init: vi.fn(),
    capture: vi.fn(),
    captureException: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
  },
}));

vi.mock('posthog-js', () => ({ default: mockPosthog }));

const KEY = 'phc_test';

/**
 * Exercises the module's contract rather than PostHog's (JEF-349): that
 * nothing loads without a key or before consent, that what does get sent
 * carries the route, release and trace id, and that every payload has been
 * through the scrubber.
 */
async function loadModule() {
  vi.resetModules();
  return import('#/lib/analytics/analytics');
}

describe('web analytics', () => {
  beforeEach(() => {
    Object.values(mockPosthog).forEach((fn) => fn.mockReset());
    vi.stubEnv('VITE_POSTHOG_KEY', KEY);
    vi.stubEnv('VITE_APP_RELEASE', 'deadbeef');
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost:3000', pathname: '/applications/abc123' },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('loads nothing when no key is configured — the normal state in dev and CI', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '');
    const analytics = await loadModule();

    await expect(analytics.initAnalytics()).resolves.toBeNull();
    expect(mockPosthog.init).not.toHaveBeenCalled();
  });

  it('initialises with autocapture off and replay disabled', async () => {
    const analytics = await loadModule();
    await analytics.initAnalytics();

    expect(mockPosthog.init).toHaveBeenCalledTimes(1);
    const [key, options] = mockPosthog.init.mock.calls[0] as [string, Record<string, unknown>];
    expect(key).toBe(KEY);
    // The single most important assertion in this file: autocapture would
    // record the text of clicked elements, which on these pages is company
    // names, job titles and salaries.
    expect(options.autocapture).toBe(false);
    expect(options.disable_session_recording).toBe(true);
    expect(options.api_host).toBe('https://eu.i.posthog.com');
    expect(options.before_send).toBeTypeOf('function');
  });

  it('turns on Core Web Vitals and nothing else with them (JEF-360)', async () => {
    const analytics = await loadModule();
    await analytics.initAnalytics();

    const [, options] = mockPosthog.init.mock.calls[0] as [string, Record<string, unknown>];
    expect(options.capture_performance).toEqual({
      web_vitals: true,
      web_vitals_allowed_metrics: ['LCP', 'INP', 'CLS', 'FCP'],
      web_vitals_attribution: false,
      network_timing: false,
    });
    // Enabling vitals must not have loosened either of these.
    expect(options.autocapture).toBe(false);
    expect(options.disable_session_recording).toBe(true);
  });

  it('reports a web-vitals event by route, with no application id or query string', async () => {
    const analytics = await loadModule();
    // After loadModule: it resets the registry, so this must be the same
    // routeTemplate instance analytics.ts just imported.
    const { setRouteResolver, resetRouteResolverForTests } =
      await import('#/lib/analytics/routeTemplate');
    setRouteResolver((pathname) =>
      pathname.startsWith('/applications/') ? '/applications/$applicationId/' : undefined,
    );
    await analytics.initAnalytics();
    const [, options] = mockPosthog.init.mock.calls[0] as [
      string,
      { before_send: (event: unknown) => { properties: Record<string, unknown> } },
    ];

    const pageUrl = 'http://localhost:3000/applications/abc123?tab=notes';
    const sent = options.before_send({
      event: '$web_vitals',
      properties: {
        token: KEY,
        $current_url: pageUrl,
        $pathname: '/applications/abc123',
        $web_vitals_LCP_value: 1800,
        $web_vitals_LCP_event: { name: 'LCP', value: 1800, $current_url: pageUrl },
      },
    });

    expect(JSON.stringify(sent)).not.toContain('abc123');
    expect(JSON.stringify(sent)).not.toContain('tab=notes');
    expect(sent.properties.$current_url).toBe('http://localhost:3000/applications/$applicationId');
    expect(sent.properties.$web_vitals_LCP_value).toBe(1800);
    // The project key survives, or the event never reaches the project.
    expect(sent.properties.token).toBe(KEY);
    resetRouteResolverForTests();
  });

  it('initialises once even when consent is re-granted', async () => {
    const analytics = await loadModule();
    await analytics.initAnalytics();
    await analytics.initAnalytics();

    expect(mockPosthog.init).toHaveBeenCalledTimes(1);
    expect(mockPosthog.opt_in_capturing).toHaveBeenCalledTimes(1);
  });

  it('attaches the route and release to every exception', async () => {
    const analytics = await loadModule();
    await analytics.initAnalytics();

    const error = new Error('boom');
    analytics.captureException(error, { kind: 'route_error_boundary' });

    expect(mockPosthog.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        route: '/applications/abc123',
        release: 'deadbeef',
        kind: 'route_error_boundary',
      }),
    );
  });

  it('attaches the last request’s trace id, which is the jump to the Axiom trace', async () => {
    const analytics = await loadModule();
    const { rememberTraceId } = await import('#/lib/analytics/traceContext');
    await analytics.initAnalytics();

    rememberTraceId('f'.repeat(32));
    analytics.captureException(new Error('boom'));

    expect(mockPosthog.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ trace_id: 'f'.repeat(32) }),
    );
  });

  it('scrubs the properties a caller passes, not just the ones PostHog adds', async () => {
    const analytics = await loadModule();
    await analytics.initAnalytics();

    analytics.captureException(new Error('boom'), {
      variables: { company: 'Acme' },
      email: 'a@b.com',
    });

    const [, properties] = mockPosthog.captureException.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(properties.variables).toBe('[redacted]');
    expect(properties.email).toBe('[redacted]');
    expect(JSON.stringify(properties)).not.toContain('Acme');
  });

  it('buffers an exception raised before consent and sends it once consent lands', async () => {
    const analytics = await loadModule();

    analytics.captureException(new Error('early'));
    expect(mockPosthog.captureException).not.toHaveBeenCalled();

    await analytics.initAnalytics();
    expect(mockPosthog.captureException).toHaveBeenCalledTimes(1);
  });

  it('discards the buffer when consent is withheld instead of sending it later', async () => {
    const analytics = await loadModule();

    analytics.captureException(new Error('early'));
    analytics.shutdownAnalytics();
    await analytics.initAnalytics();

    expect(mockPosthog.captureException).not.toHaveBeenCalled();
  });

  it('drops product events raised before consent rather than buffering them', async () => {
    const analytics = await loadModule();

    analytics.captureEvent(analytics.ANALYTICS_EVENTS.APPLICATION_CREATED);
    await analytics.initAnalytics();

    expect(mockPosthog.capture).not.toHaveBeenCalled();
  });

  it('opts out on shutdown, which is what clears the cookies already written', async () => {
    const analytics = await loadModule();
    await analytics.initAnalytics();
    analytics.shutdownAnalytics();

    expect(mockPosthog.opt_out_capturing).toHaveBeenCalledTimes(1);
  });

  it('swallows a reporting failure rather than replacing a handled error with an unhandled one', async () => {
    const analytics = await loadModule();
    await analytics.initAnalytics();
    mockPosthog.captureException.mockImplementation(() => {
      throw new Error('posthog exploded');
    });

    expect(() => analytics.captureException(new Error('boom'))).not.toThrow();
  });
});
