import { useEffect, useState } from 'react';
import { Button, Checkbox, Modal } from '@trakwyn/ui';
import { initAnalytics, shutdownAnalytics } from '#/lib/analytics';
import { useLocale } from '#/lib/i18n';
import { getRequiresCookieConsent } from '#/lib/consentRegion';
import {
  getStoredConsent,
  saveConsent,
  onOpenCookiePreferencesRequested,
} from '#/lib/cookieConsent';

type Stage = 'hidden' | 'banner' | 'manage';

/**
 * Owns the whole cookie-consent lifecycle: determines (client-only) whether
 * this visitor is somewhere that requires opt-in before non-essential
 * cookies load, shows the banner/preferences panel, and gates analytics on
 * the result — all in one place so there's a single source of truth for
 * "should analytics be loaded right now" (JEF-211).
 *
 * Since JEF-349 that gate covers PostHog, which does error reporting as
 * well as product analytics. It sets cookies and localStorage, so it
 * belongs behind this gate rather than in the root route — and its SDK is
 * behind a dynamic import, so until `initAnalytics()` runs there is no
 * script, no cookie and no request, which is what opt-in has to mean.
 *
 * Deliberately client-only: consent choice, localStorage, and the banner
 * itself are all client concepts, and nearly every cookie-consent
 * implementation on the web shows its banner via client-side JS after the
 * page has already painted — this isn't a shortcut around SSR, it's the
 * normal shape of this feature.
 */
export function CookieConsent() {
  const { t } = useLocale();
  const [stage, setStage] = useState<Stage>('hidden');
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [analyticsDraft, setAnalyticsDraft] = useState(false);
  // Whether the user has edited the draft toggle since the panel last
  // opened — see the sync effect below for why this matters.
  const [draftTouched, setDraftTouched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRequiresCookieConsent()
      .then((requiresConsent) => {
        if (cancelled) return;
        const stored = getStoredConsent();
        // Outside a consent-required region with no explicit choice yet,
        // load analytics by default — opt-in is a GDPR/UK-GDPR concept, not
        // a general requirement. Anyone can still turn it off via "Cookie
        // preferences".
        setAnalyticsEnabled(stored ? stored.analytics : !requiresConsent);
        if (requiresConsent && !stored) setStage('banner');
      })
      .catch(() => {
        // Unknown region on a genuine failure — default to the safer,
        // more-conservative behavior rather than assuming opt-in isn't
        // required.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => onOpenCookiePreferencesRequested(() => setStage('manage')), []);

  // The one place analytics start and stop. `analyticsEnabled` begins false
  // on every render pass, so nothing loads until the region check (above) or
  // the visitor's own choice turns it on; turning it back off opts out,
  // which is what clears the cookies PostHog had already set.
  useEffect(() => {
    if (analyticsEnabled) void initAnalytics();
    else shutdownAnalytics();
  }, [analyticsEnabled]);

  // Keeps the draft toggle in sync with `analyticsEnabled` until the user
  // actually touches it. Without this, opening "Manage preferences" before
  // the async region check above resolves — a real race, not just a test
  // artifact, since a fast RPC round-trip can still lose to a quick click —
  // would snapshot the not-yet-determined default and show it as final.
  useEffect(() => {
    if (!draftTouched) setAnalyticsDraft(analyticsEnabled);
  }, [analyticsEnabled, draftTouched]);

  const commitChoice = (analytics: boolean) => {
    saveConsent(analytics);
    setAnalyticsEnabled(analytics);
    setStage('hidden');
  };

  const openManage = () => {
    setDraftTouched(false);
    setStage('manage');
  };

  const acceptAll = () => commitChoice(true);
  const rejectNonEssential = () => commitChoice(false);
  const savePreferences = () => commitChoice(analyticsDraft);

  return (
    <>
      {stage === 'banner' && (
        <div
          role="region"
          aria-label={t('cookieConsent.bannerAria')}
          className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white p-4 shadow-lg sm:p-6 dark:border-gray-700 dark:bg-gray-800"
        >
          <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t('cookieConsent.bannerDescription')}
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={openManage}>
                {t('cookieConsent.managePreferences')}
              </Button>
              <Button variant="secondary" size="sm" onClick={rejectNonEssential}>
                {t('cookieConsent.rejectNonEssential')}
              </Button>
              <Button size="sm" onClick={acceptAll}>
                {t('cookieConsent.acceptAll')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={stage === 'manage'}
        onClose={() => setStage('hidden')}
        title={t('cookieConsent.preferencesTitle')}
        size="sm"
      >
        <div className="space-y-4 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('cookieConsent.preferencesDescription')}
          </p>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {t('cookieConsent.necessaryTitle')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('cookieConsent.necessaryDescription')}
              </p>
            </div>
            <Checkbox checked disabled aria-label={t('cookieConsent.necessaryTitle')} />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {t('cookieConsent.analyticsTitle')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('cookieConsent.analyticsDescription')}
              </p>
            </div>
            <Checkbox
              checked={analyticsDraft}
              onChange={(e) => {
                setDraftTouched(true);
                setAnalyticsDraft(e.target.checked);
              }}
              aria-label={t('cookieConsent.analyticsTitle')}
            />
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={savePreferences}>
              {t('cookieConsent.savePreferences')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
