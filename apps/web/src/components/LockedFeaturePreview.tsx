import { Link } from '@tanstack/react-router';
import { LockIcon } from 'lucide-react';
import { trackLockedPreviewClick, type LockedPreviewFeature } from '#/lib/analytics/funnel';
import { useLocale } from '#/lib/i18n';
import { Card } from '@trakwyn/ui';

interface LockedFeaturePreviewProps {
  feature: LockedPreviewFeature;
  className?: string;
}

// Fictional, static sample data. Nothing here comes from the user's account.
const SAMPLE_BARS = [38, 62, 45, 80, 58, 92, 70];
const SAMPLE_ROWS = [
  { width: 'w-3/4', value: '$142,000' },
  { width: 'w-2/3', value: '$128,500' },
  { width: 'w-4/5', value: '$156,000' },
];

function SampleAnalytics() {
  return (
    <div className="flex h-28 items-end gap-2">
      {SAMPLE_BARS.map((height, i) => (
        <div key={i} className="flex-1 rounded-t bg-blue-500/70" style={{ height: `${height}%` }} />
      ))}
    </div>
  );
}

function SampleOffers() {
  return (
    <div className="space-y-3">
      {SAMPLE_ROWS.map((row, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className={`h-3 rounded-sm bg-gray-300 dark:bg-gray-600 ${row.width}`} />
          <span className="ml-auto text-sm font-medium text-gray-700 dark:text-gray-300">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * What a Pro feature looks like, for a Free user, in place of the error the
 * API would answer with (JEF-523). Show it only when `useFeatureLocked` says
 * the plan withholds the feature, never from a plan name. The sample is
 * decorative and hidden from assistive technology.
 */
export function LockedFeaturePreview({ feature, className }: LockedFeaturePreviewProps) {
  const { t } = useLocale();

  return (
    <Card
      data-testid="locked-feature-preview"
      className={['relative min-h-56 overflow-hidden p-6', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <div aria-hidden="true" className="pointer-events-none blur-sm select-none">
        {feature === 'analytics' ? <SampleAnalytics /> : <SampleOffers />}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/60 p-4 dark:bg-gray-900/60">
        <div className="max-w-sm space-y-2 text-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            <LockIcon size={12} aria-hidden="true" />
            {t('lockedPreview.badge')}
          </span>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t(`lockedPreview.${feature}.title`)}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t(`lockedPreview.${feature}.benefit`)}
          </p>
          <Link
            to="/settings/plan"
            onClick={() => trackLockedPreviewClick(feature)}
            className="inline-block text-sm font-medium text-blue-600 underline"
          >
            {t('plan.seePlans')}
          </Link>
        </div>
      </div>
    </Card>
  );
}
