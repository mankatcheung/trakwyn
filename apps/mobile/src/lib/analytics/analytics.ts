import PostHog from 'posthog-react-native';
import { POSTHOG_API_KEY, POSTHOG_EU_HOST, POSTHOG_HOST } from '../../constants';
import { scrubEvent, scrubValue } from './scrub';
import { getLastTraceId } from './traceContext';

/**
 * The mobile app's error and crash reporting (JEF-349).
 *
 * Before this, a crash on a user's device left no trace anywhere — and
 * unlike the web app, nothing we could write ourselves would have fixed
 * the worst case: a React Native app crashing in native code dies before
 * any JavaScript runs, so only a native handler can report it. That is
 * `errorTracking.autocapture.nativeCrashes` below.
 *
 * Native crashes need `@posthog/react-native-plugin`, which is a plain
 * dependency and nothing more. It is a native module picked up by Expo
 * autolinking, **not** an Expo config plugin — it ships no `app.plugin.js`,
 * and listing it in app.json's `plugins` makes `expo start` fail to load
 * the config at all. Being a native module, it also means native crash
 * capture only works in a dev or EAS build; in Expo Go the JS handlers
 * above still run and `nativeCrashes` is simply inert.
 *
 * No consent gate here, unlike web. There is no cookie banner in a native
 * app, the app stores are governed by their own privacy-label disclosure,
 * and — more to the point — the scrubber below means the payload carries
 * no personal data to consent to. If that changes, this is where the gate
 * goes.
 */

/** Product events, mirroring apps/web's `ANALYTICS_EVENTS`. */
export const ANALYTICS_EVENTS = {
  APPLICATION_CREATED: 'application_created',
  ASSISTANT_USED: 'assistant_used',
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

type Properties = Record<string, unknown>;

/**
 * PostHog's own property type, taken from the method rather than imported:
 * it lives in `@posthog/core`, which is a transitive dependency and not
 * one this app should start importing from directly.
 */
type EventProperties = NonNullable<Parameters<PostHog['capture']>[1]>;

let client: PostHog | null = null;

/**
 * The scrubber's output is JSON-serialisable by construction — it emits
 * only strings, numbers, booleans, null, arrays and plain objects — but
 * that is a property of the code rather than of the `unknown` it is typed
 * with, so the cast is stated once here instead of at each call site.
 */
function asEventProperties(properties: Properties): EventProperties {
  return properties as EventProperties;
}

/** Properties every event carries, so an error can be placed without asking the reporter. */
function baseProperties(): Properties {
  const traceId = getLastTraceId();
  return traceId ? { trace_id: traceId } : {};
}

/**
 * Starts PostHog. Called once, from the root layout.
 *
 * A missing key is the normal state in development and in CI, and leaves
 * every function below a no-op rather than producing a stream of failed
 * requests.
 */
export function initAnalytics(): PostHog | null {
  if (client) return client;
  if (!POSTHOG_API_KEY) return null;

  client = new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_HOST ?? POSTHOG_EU_HOST,
    // apps/web's `autocapture: false` has no constructor equivalent here:
    // on React Native autocapture is opt-in through `<PostHogProvider
    // autocapture>`, which this app deliberately does not mount. The effect
    // is the same and the reason is the same — autocapture records the
    // labels and text of the views a user touches, and these screens show
    // company names, job titles, notes and salaries.
    //
    // Lifecycle events (installed, updated, opened, backgrounded) carry no
    // user content and are what makes a crash-free-sessions rate meaningful.
    captureAppLifecycleEvents: true,
    enableSessionReplay: false,
    errorTracking: {
      autocapture: {
        uncaughtExceptions: true,
        unhandledRejections: true,
        // The one thing no JS-level handler can catch.
        nativeCrashes: true,
        // Console output is not a reliable place to look for an absence of
        // user data, and it is the easiest way to leak some by accident.
        console: false,
      },
    },
    before_send: scrubEvent,
  });
  return client;
}

/**
 * Reports an exception, with the trace id of the last API request when
 * there was one.
 *
 * Never throws: every caller is on an error path already, and a reporting
 * failure there would replace a handled error with an unhandled one.
 */
export function captureException(error: unknown, properties: Properties = {}): void {
  try {
    client?.captureException(
      error,
      asEventProperties({ ...baseProperties(), ...(scrubValue(properties) as Properties) }),
    );
  } catch {
    // Best-effort by nature; see above.
  }
}

/** Reports a named product event. */
export function captureEvent(event: AnalyticsEvent, properties: Properties = {}): void {
  try {
    client?.capture(
      event,
      asEventProperties({ ...baseProperties(), ...(scrubValue(properties) as Properties) }),
    );
  } catch {
    // Best-effort, as above.
  }
}

/**
 * Records a breadcrumb — the short trail of what the app was doing that
 * gets attached to the next exception as `$exception_steps`.
 *
 * This is where a native crash becomes readable: the crash itself arrives
 * as an address in a stack, and what precedes it (a token refresh that was
 * rejected, a SecureStore write that failed, a stream that reconnected
 * three times) is usually the whole explanation. `message` is a fixed
 * string chosen at the call site and `properties` goes through the
 * scrubber, so a breadcrumb cannot become a back door for the data the
 * events themselves are careful not to carry.
 */
export function addBreadcrumb(message: string, properties: Properties = {}): void {
  try {
    client?.addExceptionStep(message, scrubValue(properties) as Properties);
  } catch {
    // Best-effort, as above.
  }
}

/** Test seam: drops the module's handle on PostHog so each test starts uninitialised. */
export function resetAnalyticsForTests(): void {
  client = null;
}
