import { gqlClient } from '#/graphql/client';

const STORAGE_KEY = 'trakwyn_cookie_consent';
/** Dispatched by anything that wants to (re)open the preferences panel —
 * e.g. a "Cookie preferences" footer link, which lives in a route file with
 * no direct access to `<CookieConsent>`'s internal state. */
const OPEN_PREFERENCES_EVENT = 'trakwyn:open-cookie-preferences';

export interface CookieConsentChoice {
  analytics: boolean;
  consentedAt: string;
}

export function getStoredConsent(): CookieConsentChoice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookieConsentChoice>;
    return typeof parsed.analytics === 'boolean' && typeof parsed.consentedAt === 'string'
      ? (parsed as CookieConsentChoice)
      : null;
  } catch {
    return null;
  }
}

/** Saves the choice locally (what actually gates rendering — the caller
 * updates its own state after this) and best-effort logs it server-side for
 * audit purposes; a failure there doesn't affect the choice taking
 * effect. */
export function saveConsent(analytics: boolean): void {
  const choice: CookieConsentChoice = { analytics, consentedAt: new Date().toISOString() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Storage unavailable (private browsing, quota) — the in-memory state
    // this render cycle still reflects the choice; it just won't persist.
  }

  void gqlClient
    .request(RECORD_COOKIE_CONSENT_MUTATION, { analyticsAccepted: analytics })
    .catch(() => {
      // Best-effort audit trail — the visitor's own choice already took
      // effect via localStorage above regardless of whether this lands.
    });
}

export function requestOpenCookiePreferences(): void {
  window.dispatchEvent(new Event(OPEN_PREFERENCES_EVENT));
}

export function onOpenCookiePreferencesRequested(handler: () => void): () => void {
  window.addEventListener(OPEN_PREFERENCES_EVENT, handler);
  return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, handler);
}

const RECORD_COOKIE_CONSENT_MUTATION = `
  mutation RecordCookieConsent($analyticsAccepted: Boolean!) {
    recordCookieConsent(analyticsAccepted: $analyticsAccepted)
  }
`;
