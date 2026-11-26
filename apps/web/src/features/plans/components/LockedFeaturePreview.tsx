import { Link } from '@tanstack/react-router';
import { LockIcon } from 'lucide-react';
import { trackLockedPreviewClick, type LockedPreviewFeature } from '#/lib/analytics/funnel';
import { useLocale } from '#/lib/i18n';
import { getScreenshot, type ScreenshotName } from '#/features/marketing/lib/screenshots';

/**
 * The real marketing crops of each locked page, shown dimmed behind the message
 * (JEF-693). They are photographs of the seeded demo account, never the viewer's own
 * data, and they replace the blurred bars and rows this once drew: those looked like
 * a decoy, and on Offers the message sat over the placeholder rows.
 */
const LOCKED_SHOTS: Record<LockedPreviewFeature, ScreenshotName[]> = {
  analytics: ['crop-analytics-stats', 'crop-stage-funnel', 'crop-channels'],
  offers: ['crop-offers'],
};

function LockedMessage({ feature }: { feature: LockedPreviewFeature }) {
  const { t } = useLocale();

  return (
    <div className="max-w-sm space-y-2 text-center">
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        <LockIcon size={12} aria-hidden="true" />
        {t('lockedPreview.badge')}
      </span>
      <h2 className="text-sm font-medium text-stone-900 dark:text-stone-100">
        {t(`lockedPreview.${feature}.title`)}
      </h2>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        {t(`lockedPreview.${feature}.benefit`)}
      </p>
      <Link
        to="/settings/plan"
        onClick={() => trackLockedPreviewClick(feature)}
        className="inline-block text-sm font-medium text-blue-800 dark:text-blue-400 underline"
      >
        {t('plan.seePlans')}
      </Link>
    </div>
  );
}

/** One crop in both themes; the stylesheet shows the one that matches. Decorative, so no alt text. */
function Shot({ name }: { name: ScreenshotName }) {
  const light = getScreenshot(name, 'light');
  const dark = getScreenshot(name, 'dark');
  const common = 'h-auto w-full rounded-xl border';
  return (
    <>
      <img
        src={light.src}
        width={light.width}
        height={light.height}
        alt=""
        loading="lazy"
        decoding="async"
        className={`${common} border-stone-200 dark:hidden`}
      />
      <img
        src={dark.src}
        width={dark.width}
        height={dark.height}
        alt=""
        loading="lazy"
        decoding="async"
        className={`${common} hidden border-stone-700 dark:block`}
      />
    </>
  );
}

interface LockedFeatureOverlayProps {
  feature: LockedPreviewFeature;
}

/**
 * Covers a whole page for a Free user (JEF-523): a dimmed, inert picture of the real
 * page, hidden from assistive technology, with one message card over it that stays in
 * view while the page scrolls. Show it only when `useFeatureLocked` says the plan
 * withholds the feature, never from a plan name.
 */
export function LockedFeatureOverlay({ feature }: LockedFeatureOverlayProps) {
  return (
    <div data-testid="locked-feature-overlay" className="relative min-h-80">
      <div
        aria-hidden="true"
        inert
        className="pointer-events-none space-y-4 opacity-40 select-none dark:opacity-30"
      >
        {LOCKED_SHOTS[feature].map((name) => (
          <Shot key={name} name={name} />
        ))}
      </div>
      <div className="absolute inset-0">
        <div className="sticky top-24 flex justify-center px-4 pt-16">
          <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-lg dark:border-stone-700 dark:bg-stone-800">
            <LockedMessage feature={feature} />
          </div>
        </div>
      </div>
    </div>
  );
}
