import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

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

type Reporter = typeof import('#/components/RouteErrorReporter').RouteErrorReporter;

/**
 * `analytics.ts` reads `import.meta.env.VITE_POSTHOG_KEY` once, at module
 * load, so the key has to be stubbed before the module is first imported —
 * which means a fresh registry and a dynamic import per test rather than a
 * static import at the top of the file.
 */
let RouteErrorReporter: Reporter;

/**
 * The route error boundary is the one render-time failure PostHog's own
 * autocapture cannot see — React catches it before it reaches
 * `window.onerror` — so this asserts the explicit report actually happens,
 * happens once, and carries nothing it shouldn't (JEF-349).
 *
 * Deliberately wired to the real analytics module with only `posthog-js`
 * mocked, so the scrubber and the base properties are exercised rather than
 * stubbed past.
 */
describe('RouteErrorReporter', () => {
  beforeEach(async () => {
    Object.values(mockPosthog).forEach((fn) => fn.mockReset());
    vi.resetModules();
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    vi.stubEnv('VITE_APP_RELEASE', 'deadbeef');
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost:3000', pathname: '/applications/abc123' },
      writable: true,
      configurable: true,
    });

    ({ RouteErrorReporter } = await import('#/components/RouteErrorReporter'));
    await (await import('#/lib/analytics/analytics')).initAnalytics();
  });

  afterEach(() => vi.unstubAllEnvs());

  it('reports a render error with the route and the release', () => {
    const error = new Error('render blew up');
    render(<RouteErrorReporter error={error} />);

    expect(mockPosthog.captureException).toHaveBeenCalledTimes(1);
    expect(mockPosthog.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        route: '/applications/abc123',
        release: 'deadbeef',
        kind: 'route_error_boundary',
      }),
    );
  });

  it('reports once, not once per re-render of the fallback', () => {
    const error = new Error('render blew up');
    const { rerender } = render(<RouteErrorReporter error={error} />);

    // A theme toggle or locale change re-renders the boundary's fallback
    // without the page having broken again.
    rerender(<RouteErrorReporter error={error} />);
    rerender(<RouteErrorReporter error={error} />);

    expect(mockPosthog.captureException).toHaveBeenCalledTimes(1);
  });

  it('reports again when a different error arrives', () => {
    const { rerender } = render(<RouteErrorReporter error={new Error('first')} />);
    rerender(<RouteErrorReporter error={new Error('second')} />);

    expect(mockPosthog.captureException).toHaveBeenCalledTimes(2);
  });

  it('sends no GraphQL variables, whatever the error is carrying', () => {
    // A ClientError-shaped failure surfacing through a render is the case
    // that would leak an entire application form in one event.
    const error = Object.assign(new Error('GraphQL request failed'), {
      variables: { input: { company: 'Acme Corp', salaryRange: '120k', description: 'secret' } },
      email: 'ada@example.com',
    });

    render(<RouteErrorReporter error={error} />);

    const [, properties] = mockPosthog.captureException.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(properties).not.toHaveProperty('variables');
    const serialised = JSON.stringify(properties);
    expect(serialised).not.toContain('Acme Corp');
    expect(serialised).not.toContain('120k');
    expect(serialised).not.toContain('ada@example.com');
  });

  it('renders nothing of its own', () => {
    const { container } = render(<RouteErrorReporter error={new Error('x')} />);
    expect(container).toBeEmptyDOMElement();
  });
});
