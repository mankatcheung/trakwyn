import { useLocale } from '#/lib/i18n';
import { Card } from '@trakwyn/ui';

// Fictional, static numbers. Nothing here comes from the user's account.
const SAMPLE_STATS = [
  { key: 'dashboard.statTotal', value: '48' },
  { key: 'analyticsPage.statActive', value: '21' },
  { key: 'analyticsPage.statResponseRate', value: '58%' },
  { key: 'analyticsPage.statOfferRate', value: '12%' },
  { key: 'analyticsPage.statGhostingRate', value: '19%' },
] as const;

const SAMPLE_BARS = [38, 62, 45, 80, 58, 92, 70, 54];
const SAMPLE_ROWS = ['w-11/12', 'w-4/5', 'w-2/3', 'w-3/4'];

function Bars({ height }: { height: string }) {
  return (
    <div className={`flex items-end gap-2 ${height}`}>
      {SAMPLE_BARS.map((h, i) => (
        <div key={i} className="flex-1 rounded-t bg-blue-500/70" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

function Rows() {
  return (
    <div className="space-y-4">
      {SAMPLE_ROWS.map((width, i) => (
        <div key={i} className="h-3 rounded-sm bg-green-500/60" style={{ opacity: 1 - i * 0.12 }}>
          <div className={`h-3 ${width}`} />
        </div>
      ))}
    </div>
  );
}

/**
 * A whole analytics page of made-up numbers, drawn behind the locked overlay
 * for a Free user (JEF-523). It mirrors the real page's layout so the blur
 * reads as "this is what you would get", and it never touches the user's data
 * or the gated queries.
 */
export function LockedAnalyticsSample() {
  const { t } = useLocale();

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {SAMPLE_STATS.map(({ key, value }) => (
          <Card key={key} className="p-4">
            <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">{t(key)}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
          </Card>
        ))}
      </div>
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
          {t('analyticsPage.applicationsPerWeek')}
        </h2>
        <Bars height="h-48" />
      </Card>
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
          {t('analyticsPage.stageFunnel')}
        </h2>
        <Rows />
      </Card>
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="p-6">
          <Rows />
        </Card>
      ))}
    </div>
  );
}
