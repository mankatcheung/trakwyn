import { ANALYTICS_EVENTS, captureEvent } from './analytics';

/**
 * Event helpers for the marketing → signup → Pro funnel (JEF-514).
 *
 * Every property here is a member of a closed string union, never a value
 * the visitor typed, so nothing in them can be an email, a name or a query
 * string and `scrub.ts` has nothing to redact.
 */

export type CtaName = 'start_free' | 'get_started' | 'get_started_free' | 'get_pro';

export type CtaLocation =
  | 'hero'
  | 'closing'
  | 'ai_demo'
  | 'header'
  | 'header_mobile'
  | 'feature_hero'
  | 'feature_closing'
  | 'guide'
  | 'pricing_free'
  | 'pricing_pro';

/** A Pro feature a Free user was shown a locked preview of (JEF-523). */
export type LockedPreviewFeature = 'analytics' | 'offers';

export type RegisterMethod = 'password' | 'google' | 'github';

/** Reports a click on a marketing call to action. */
export function trackCta(cta: CtaName, location: CtaLocation): void {
  captureEvent(ANALYTICS_EVENTS.MARKETING_CTA_CLICKED, { cta, location });
}

const OAUTH_REGISTRATION_KEY = 'trakwyn_oauth_registration';

/**
 * Remembers that the visitor left for an OAuth provider from the register
 * page. The provider redirects through the API, which sends the browser
 * straight to the app, so the page that finds out the sign-up worked is not
 * the one that started it. sessionStorage is per tab and gone when the tab
 * closes, which is the lifetime the round trip needs.
 */
export function markOAuthRegistration(method: RegisterMethod): void {
  try {
    window.sessionStorage.setItem(OAUTH_REGISTRATION_KEY, method);
  } catch {
    // Storage blocked: the sign-up goes uncounted, nothing else changes.
  }
}

/**
 * On the first authenticated page after an OAuth round trip from the
 * register page, reports `register_completed` once. The API's callback does
 * not say whether the account is new, so a returning user who picked the
 * provider on the register page is counted as well.
 */
export function consumeOAuthRegistration(): void {
  try {
    const method = window.sessionStorage.getItem(OAUTH_REGISTRATION_KEY);
    if (!method) return;
    window.sessionStorage.removeItem(OAUTH_REGISTRATION_KEY);
    if (method === 'google' || method === 'github') {
      captureEvent(ANALYTICS_EVENTS.REGISTER_COMPLETED, { method });
    }
  } catch {
    // Best-effort, as with every analytics call.
  }
}

/** Reports a click on the upgrade link of a locked feature preview. */
export function trackLockedPreviewClick(feature: LockedPreviewFeature): void {
  captureEvent(ANALYTICS_EVENTS.UPGRADE_CLICKED, { source: 'locked_preview', feature });
}
