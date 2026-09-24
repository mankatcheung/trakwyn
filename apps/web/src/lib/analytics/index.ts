/**
 * One import path for the web app's error and analytics reporting
 * (JEF-349) — call sites take `captureException`/`captureEvent` from here
 * and never reach for `posthog-js` directly, so the SDK stays behind the
 * consent gate and the `before_send` scrubber in analytics.ts.
 */
export {
  ANALYTICS_EVENTS,
  captureEvent,
  captureException,
  initAnalytics,
  resetAnalyticsForTests,
  shutdownAnalytics,
  type AnalyticsEvent,
} from './analytics';
export {
  getLastTraceId,
  isApiRequest,
  newTraceContext,
  rememberTraceId,
  resetTraceContext,
  type TraceContext,
} from './traceContext';
export { REDACTED, scrubEvent, scrubString, scrubValue } from './scrub';
export { transportFailureProperties, type TransportFailureProperties } from './transportFailure';
