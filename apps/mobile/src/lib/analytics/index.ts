/**
 * One import path for the mobile app's error and crash reporting
 * (JEF-349) — call sites take these from here and never reach for
 * `posthog-react-native` directly, so every payload goes through the
 * `before_send` scrubber configured in analytics.ts.
 */
export {
  ANALYTICS_EVENTS,
  addBreadcrumb,
  captureEvent,
  captureException,
  initAnalytics,
  resetAnalyticsForTests,
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
