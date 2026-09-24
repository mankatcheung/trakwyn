const mockPostHogInstance = {
  capture: jest.fn(),
  captureException: jest.fn(),
  addExceptionStep: jest.fn(),
};
const mockPostHogConstructor = jest.fn(() => mockPostHogInstance);

jest.mock('posthog-react-native', () => ({
  __esModule: true,
  default: mockPostHogConstructor,
}));

/**
 * Exercises the module's contract rather than PostHog's (JEF-349): that
 * nothing starts without a key, that native crash capture is actually
 * requested, and that everything leaving the device has been through the
 * scrubber.
 *
 * The key is read from `../../constants` at module load, so each test
 * re-requires the module with a fresh registry. `require` rather than a
 * dynamic `import()`: jest-expo transforms to CommonJS and runs without
 * `--experimental-vm-modules`, where `import()` throws.
 */
function loadAnalytics(key: string | undefined): typeof import('../analytics') {
  jest.resetModules();
  jest.doMock('../../../constants', () => ({
    POSTHOG_API_KEY: key ?? '',
    POSTHOG_EU_HOST: 'https://eu.i.posthog.com',
    POSTHOG_HOST: undefined,
  }));
  return require('../analytics') as typeof import('../analytics');
}

describe('mobile analytics', () => {
  beforeEach(() => {
    mockPostHogConstructor.mockClear();
    Object.values(mockPostHogInstance).forEach((fn) => fn.mockReset());
  });

  it('starts nothing without a key — the normal state in dev and CI', () => {
    const analytics = loadAnalytics(undefined);

    expect(analytics.initAnalytics()).toBeNull();
    expect(mockPostHogConstructor).not.toHaveBeenCalled();
  });

  it('asks for native crash capture, which no JS handler could provide', () => {
    const analytics = loadAnalytics('phc_test');
    analytics.initAnalytics();

    const [key, options] = mockPostHogConstructor.mock.calls[0] as unknown as [
      string,
      Record<string, never>,
    ];
    expect(key).toBe('phc_test');
    const errorTracking = options.errorTracking as unknown as {
      autocapture: Record<string, boolean>;
    };
    expect(errorTracking.autocapture.nativeCrashes).toBe(true);
    expect(errorTracking.autocapture.uncaughtExceptions).toBe(true);
    expect(errorTracking.autocapture.unhandledRejections).toBe(true);
    // Console output is not a place we can promise is free of user data.
    expect(errorTracking.autocapture.console).toBe(false);
  });

  it('sends to the EU host and keeps session replay off', () => {
    const analytics = loadAnalytics('phc_test');
    analytics.initAnalytics();

    const [, options] = mockPostHogConstructor.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(options.host).toBe('https://eu.i.posthog.com');
    expect(options.enableSessionReplay).toBe(false);
    expect(options.before_send).toBeInstanceOf(Function);
  });

  it('constructs PostHog once, however often init is called', () => {
    const analytics = loadAnalytics('phc_test');
    analytics.initAnalytics();
    analytics.initAnalytics();

    expect(mockPostHogConstructor).toHaveBeenCalledTimes(1);
  });

  it('scrubs the properties a caller passes to captureException', () => {
    const analytics = loadAnalytics('phc_test');
    analytics.initAnalytics();

    analytics.captureException(new Error('boom'), {
      accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig',
      salary: 120000,
    });

    const [, properties] = mockPostHogInstance.captureException.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(properties.accessToken).toBe('[redacted]');
    expect(properties.salary).toBe('[redacted]');
  });

  it('scrubs breadcrumb properties too, so they cannot become a back door', () => {
    const analytics = loadAnalytics('phc_test');
    analytics.initAnalytics();

    analytics.addBreadcrumb('Navigated', { route: '/applications/[id]', email: 'a@b.com' });

    expect(mockPostHogInstance.addExceptionStep).toHaveBeenCalledWith('Navigated', {
      route: '/applications/[id]',
      email: '[redacted]',
    });
  });

  it('attaches the last request’s trace id, which is the jump to the Axiom trace', () => {
    const analytics = loadAnalytics('phc_test');
    // The same fresh module instance analytics.ts just required.
    const { rememberTraceId, resetTraceContext } =
      require('../traceContext') as typeof import('../traceContext');
    analytics.initAnalytics();

    rememberTraceId('c'.repeat(32));
    analytics.captureException(new Error('boom'));

    const [, properties] = mockPostHogInstance.captureException.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(properties.trace_id).toBe('c'.repeat(32));
    resetTraceContext();
  });

  // JEF-367: lets errors raised while offline be filtered out in PostHog.
  it('says whether the device was connected, once that is known', () => {
    const analytics = loadAnalytics('phc_test');
    const { rememberNetworkConnected } =
      require('../networkState') as typeof import('../networkState');
    analytics.initAnalytics();

    analytics.captureException(new Error('before NetInfo reported'));
    rememberNetworkConnected(false);
    analytics.captureException(new Error('offline'));

    const [[, unknown], [, offline]] = mockPostHogInstance.captureException.mock.calls as [
      unknown,
      Record<string, unknown>,
    ][];
    expect(unknown).not.toHaveProperty('$network_connected');
    expect(offline.$network_connected).toBe(false);
  });

  it('passes a network breadcrumb through the scrubber intact', () => {
    const analytics = loadAnalytics('phc_test');
    analytics.initAnalytics();

    analytics.addBreadcrumb('Network changed', { connected: true, reachable: null, type: 'wifi' });

    expect(mockPostHogInstance.addExceptionStep).toHaveBeenCalledWith('Network changed', {
      connected: true,
      reachable: null,
      type: 'wifi',
    });
  });

  it('is a no-op rather than a crash when PostHog was never started', () => {
    const analytics = loadAnalytics(undefined);

    expect(() => analytics.captureException(new Error('boom'))).not.toThrow();
    expect(() => analytics.addBreadcrumb('x')).not.toThrow();
    expect(() =>
      analytics.captureEvent(analytics.ANALYTICS_EVENTS.APPLICATION_CREATED),
    ).not.toThrow();
    expect(mockPostHogInstance.captureException).not.toHaveBeenCalled();
  });

  it('swallows a reporting failure rather than replacing a handled error with an unhandled one', () => {
    const analytics = loadAnalytics('phc_test');
    analytics.initAnalytics();
    mockPostHogInstance.captureException.mockImplementation(() => {
      throw new Error('posthog exploded');
    });

    expect(() => analytics.captureException(new Error('boom'))).not.toThrow();
  });
});
