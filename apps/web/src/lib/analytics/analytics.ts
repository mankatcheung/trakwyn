import type { CaptureResult, PostHog } from 'posthog-js';
import { POSTHOG_EU_HOST, POSTHOG_PENDING_EXCEPTION_LIMIT, WEB_VITALS_METRICS } from '#/constants';
import { templateEventUrls } from './routeTemplate';
import { scrubEvent, scrubValue } from './scrub';
import { getLastTraceId } from './traceContext';

/**
 * The web app's error and analytics reporting (JEF-349).
 *
 * PostHog replaces `@vercel/analytics` outright: it covers exceptions,
 * which we had nowhere to send, *and* product events, which is why the
 * older GA4 ticket (JEF-337) is superseded rather than done alongside.
 *
 * Two properties of this module matter more than what it sends:
 *
 *  1. **Nothing happens until consent.** `posthog-js` is behind a dynamic
 *     import, so before `initAnalytics()` runs there is no script on the
 *     page, no cookie, no localStorage entry and no request — which is what
 *     "gated on consent" has to mean in a consent-required region, rather
 *     than loading the SDK and asking it to stay quiet.
 *  2. **Autocapture is off.** PostHog's autocapture records the text of
 *     clicked elements and the state of inputs; on these pages that is
 *     company names, job titles, notes and salaries. Every event this app
 *     sends is one it named explicitly, and each one still passes through
 *     the `before_send` scrubber (scrub.ts) on the way out.
 */

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST;
const RELEASE = import.meta.env.VITE_APP_RELEASE;

/** Product events. Named here rather than at the call site so the set stays reviewable and typo-free. */
export const ANALYTICS_EVENTS = {
  APPLICATION_CREATED: 'application_created',
  PDF_EXPORTED: 'pdf_exported',
  ASSISTANT_USED: 'assistant_used',
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

type Properties = Record<string, unknown>;

let client: PostHog | null = null;
let initPromise: Promise<PostHog | null> | null = null;

/**
 * Exceptions raised before consent resolved.
 *
 * Outside a consent-required region analytics default to on, but that
 * default arrives from an async region check — so without this, the first
 * seconds of every page load are unreported, which is exactly where a
 * hydration mismatch or a failed initial query lands. Held in memory only,
 * bounded, and discarded outright if consent turns out to be withheld: the
 * gate is on sending, not on noticing.
 */
let pending: Array<{ error: unknown; properties: Properties }> = [];

/** Properties every event carries, so an error can be placed without asking the reporter. */
function baseProperties(): Properties {
  const traceId = getLastTraceId();
  return {
    release: RELEASE ?? 'dev',
    ...(typeof window === 'undefined' ? {} : { route: window.location.pathname }),
    ...(traceId ? { trace_id: traceId } : {}),
  };
}

/**
 * Loads and starts PostHog. Safe to call repeatedly — a second call while
 * the first is in flight joins it, and a call after opt-out opts back in
 * rather than re-initialising (PostHog keeps one instance per page).
 *
 * Resolves to `null` when there is no key configured, which is the normal
 * state in dev and in CI: reporting is a production concern, and a missing
 * key must not turn into a console full of failed requests.
 */
export function initAnalytics(): Promise<PostHog | null> {
  if (!POSTHOG_KEY || typeof window === 'undefined') return Promise.resolve(null);
  if (client) {
    client.opt_in_capturing();
    flushPending(client);
    return Promise.resolve(client);
  }
  initPromise ??= loadAndInit();
  return initPromise;
}

async function loadAndInit(): Promise<PostHog | null> {
  let posthog: PostHog;
  try {
    posthog = (await import('posthog-js')).default;
  } catch {
    // A blocked or failed SDK download is not something the app should
    // surface: reporting is best-effort by nature, and the page works
    // without it.
    initPromise = null;
    return null;
  }

  posthog.init(POSTHOG_KEY!, {
    api_host: POSTHOG_HOST ?? POSTHOG_EU_HOST,
    // See the file header: autocapture would record the contents of these
    // pages. This is the single most important line in the file.
    autocapture: false,
    capture_exceptions: true,
    capture_pageview: true,
    capture_pageleave: true,
    // No replay unless it is turned on deliberately — and if it ever is, it
    // needs input and text masking configured before it records a page that
    // shows someone's salary.
    disable_session_recording: true,
    // Anonymous events cost nothing against the person-profile allowance and
    // are all this app needs: we never identify a user to PostHog.
    person_profiles: 'never',
    // Core Web Vitals from real sessions (JEF-360). Set here rather than
    // left to the project's remote toggle, so what this app collects is
    // decided in review. Attribution is off: it adds CSS selectors of the
    // elements involved and a second, larger bundle, and the question this
    // answers is which route is slow, not which element. `network_timing`
    // only feeds session replay, which stays off.
    capture_performance: {
      web_vitals: true,
      web_vitals_allowed_metrics: [...WEB_VITALS_METRICS],
      web_vitals_attribution: false,
      network_timing: false,
    },
    before_send: beforeSend,
  });

  client = posthog;
  flushPending(posthog);
  return posthog;
}

/**
 * Every event's last stop: page URLs become route templates
 * (routeTemplate.ts), then the scrubber runs over the result. Templating
 * goes first so the scrubber's clipping can never cut a URL before the id
 * in it has been replaced.
 */
function beforeSend(event: CaptureResult | null): CaptureResult | null {
  return scrubEvent(templateEventUrls(event));
}

function flushPending(posthog: PostHog): void {
  const queued = pending;
  pending = [];
  for (const { error, properties } of queued) {
    posthog.captureException(error, properties);
  }
}

/**
 * Stops reporting and clears what PostHog stored.
 *
 * Called when the visitor turns analytics off, including after having had
 * them on — `opt_out_capturing()` both halts capture and removes the
 * cookies and localStorage entries, which is the part that matters for a
 * withdrawn consent. Anything buffered before the choice is dropped rather
 * than sent.
 */
export function shutdownAnalytics(): void {
  pending = [];
  client?.opt_out_capturing();
}

/**
 * Reports an exception, with the current route, the release and — when a
 * request has been made — the trace id that ties it to the API's trace in
 * Axiom.
 *
 * Never throws: every caller is already on an error path, and a reporting
 * failure there would replace a handled error with an unhandled one.
 */
export function captureException(error: unknown, properties: Properties = {}): void {
  const merged = { ...baseProperties(), ...(scrubValue(properties) as Properties) };
  try {
    if (!client) {
      if (POSTHOG_KEY && pending.length < POSTHOG_PENDING_EXCEPTION_LIMIT) {
        pending.push({ error, properties: merged });
      }
      return;
    }
    client.captureException(error, merged);
  } catch {
    // Reporting is best-effort; see above.
  }
}

/** Reports a named product event. Dropped silently before consent — an analytics event is not worth buffering. */
export function captureEvent(event: AnalyticsEvent, properties: Properties = {}): void {
  try {
    client?.capture(event, { ...baseProperties(), ...(scrubValue(properties) as Properties) });
  } catch {
    // Best-effort, as above.
  }
}

/** Test seam: drops the module's handle on PostHog so each test starts from an uninitialised app. */
export function resetAnalyticsForTests(): void {
  client = null;
  initPromise = null;
  pending = [];
}
