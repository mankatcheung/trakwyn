import { useLocale } from '#/lib/i18n';
import {
  planStatus,
  useBillingStatus,
  usageLevel,
  usagePercent,
  type BillingStatus,
  type PlanFeatures,
  type PlanTerms,
  type UsageLevel,
} from '#/lib/billingStatus';
import { formatStorageSize } from '#/lib/storageUsage';
import { useBillingPortal, useCheckout, type CheckoutPlan } from '#/lib/billingCheckout';
import { Alert, Badge, Button, Card, ProgressBar } from '@trakwyn/ui';

// The bar's default track is white-on-tint, which vanishes on a white card.
const TRACK = 'bg-gray-200! dark:bg-gray-700!';
const BAR_COLOR: Record<UsageLevel, string> = {
  unlimited: TRACK,
  ok: TRACK,
  warning: `${TRACK} [&>div]:bg-amber-500`,
  full: `${TRACK} [&>div]:bg-red-600`,
};

const FEATURE_ROWS: Array<{ feature: keyof PlanFeatures; labelKey: string }> = [
  { feature: 'notifications', labelKey: 'plan.rowNotifications' },
  { feature: 'analytics', labelKey: 'plan.rowAnalytics' },
  { feature: 'offers', labelKey: 'plan.rowOffers' },
  { feature: 'shareLinks', labelKey: 'plan.rowShareLinks' },
  { feature: 'apiAccess', labelKey: 'plan.rowApiAccess' },
];

interface MeterProps {
  title: string;
  used: number;
  limit: number | null;
  /** The sentence under the bar. */
  caption: string;
  /** Said once the limit is reached, as an alert. */
  fullMessage: string;
  warningMessage: string;
}

function UsageMeter({ title, used, limit, caption, fullMessage, warningMessage }: MeterProps) {
  const level = usageLevel(used, limit);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</h3>
      {limit !== null && (
        <ProgressBar value={used} max={limit} aria-label={title} className={BAR_COLOR[level]} />
      )}
      <p className="text-sm text-gray-700 dark:text-gray-300">{caption}</p>
      {level === 'warning' && (
        <p role="status" className="text-sm text-amber-600">
          {warningMessage}
        </p>
      )}
      {level === 'full' && (
        <p role="alert" className="text-sm text-red-600">
          {fullMessage}
        </p>
      )}
    </div>
  );
}

export function SettingsPlanPage() {
  const status = useBillingStatus();
  if (!status) return null;

  return (
    <div className="space-y-8">
      <PlanSummary status={status} />
      {status.enforced && <PlanActions status={status} />}
      <Usage status={status} />
      <Comparison status={status} />
    </div>
  );
}

function PlanSummary({ status }: { status: BillingStatus }) {
  const { t, formatDate } = useLocale();
  const message = planStatus(status);

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('plan.title')}
        </h2>
        <Badge tone={status.plan === 'pro' ? 'blue' : 'gray'}>
          {status.plan === 'pro' ? t('plan.badgePro') : t('plan.badgeFree')}
        </Badge>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {t(
          message.key,
          message.date ? { date: formatDate(message.date, { dateStyle: 'medium' }) } : {},
        )}
      </p>
    </Card>
  );
}

const PURCHASES: Array<{ plan: CheckoutPlan; labelKey: string }> = [
  { plan: 'monthly', labelKey: 'plan.buyMonthly' },
  { plan: 'pass3Months', labelKey: 'plan.buyPass3' },
  { plan: 'pass6Months', labelKey: 'plan.buyPass6' },
];

/** Buy Pro, or manage what was bought. Only shown where plans are enforced. */
function PlanActions({ status }: { status: BillingStatus }) {
  const { t } = useLocale();
  const checkout = useCheckout();
  const portal = useBillingPortal();
  const isSubscriber = status.plan === 'pro' && status.planSource === 'subscription';
  const hasPaid = status.planSource === 'subscription' || status.planSource === 'pass';

  return (
    <Card className="space-y-4 p-5">
      {!isSubscriber && (
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t('plan.upgradeTitle')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('plan.upgradeDescription')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {PURCHASES.map(({ plan, labelKey }) => (
              <Button
                key={plan}
                variant={plan === 'monthly' ? 'primary' : 'secondary'}
                disabled={checkout.isPending}
                onClick={() => checkout.mutate(plan)}
              >
                {t(labelKey)}
              </Button>
            ))}
          </div>
          {status.planSource === 'pass' && status.plan === 'pro' && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('plan.passForfeitNote')}</p>
          )}
          {checkout.isError && <Alert tone="error">{t('plan.checkoutFailed')}</Alert>}
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('plan.founderNote')}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('plan.refundPolicy')}</p>
        </div>
      )}
      {hasPaid && (
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t('plan.manageTitle')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('plan.manageDescription')}
            </p>
          </div>
          <Button variant="secondary" disabled={portal.isPending} onClick={() => portal.mutate()}>
            {t('plan.manageButton')}
          </Button>
          {portal.isError && <Alert tone="error">{t('plan.portalFailed')}</Alert>}
          {isSubscriber && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('plan.refundPolicy')}</p>
          )}
        </div>
      )}
    </Card>
  );
}

function Usage({ status }: { status: BillingStatus }) {
  const { t } = useLocale();
  const { usage, limits } = status;

  const countCaption = (used: number, limit: number | null, usageKey: string, openKey: string) =>
    limit === null
      ? t(openKey, { used })
      : t(usageKey, { used, limit, percent: usagePercent(used, limit) });

  return (
    <Card className="space-y-6 p-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('plan.usageTitle')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('plan.description')}</p>
      </div>
      <UsageMeter
        title={t('plan.applications')}
        used={usage.applications}
        limit={limits.applications}
        caption={countCaption(
          usage.applications,
          limits.applications,
          'plan.usageOf',
          'plan.usageNoLimit',
        )}
        warningMessage={t('plan.applicationsWarning')}
        fullMessage={t('plan.applicationsFull')}
      />
      <UsageMeter
        title={t('plan.storage')}
        used={usage.documentBytes}
        limit={limits.documentBytes}
        caption={t('storage.usage', {
          used: formatStorageSize(usage.documentBytes),
          limit: formatStorageSize(limits.documentBytes),
          percent: usagePercent(usage.documentBytes, limits.documentBytes),
        })}
        warningMessage={t('storage.warning')}
        fullMessage={t('storage.full')}
      />
      <UsageMeter
        title={t('plan.aiActions')}
        used={usage.aiActionsThisMonth}
        limit={limits.aiActionsPerMonth}
        caption={countCaption(
          usage.aiActionsThisMonth,
          limits.aiActionsPerMonth,
          'plan.usageOf',
          'plan.usageNoLimit',
        )}
        warningMessage={t('plan.aiActionsWarning')}
        fullMessage={t('plan.aiActionsFull')}
      />
    </Card>
  );
}

function Comparison({ status }: { status: BillingStatus }) {
  const { t } = useLocale();
  const { free, pro } = status.catalogue;

  const limitCell = (limit: number | null) =>
    limit === null ? t('plan.unlimited') : String(limit);
  const monthlyCell = (limit: number | null) =>
    limit === null ? t('plan.unlimited') : t('plan.perMonth', { amount: limit });
  const featureCell = (terms: PlanTerms, feature: keyof PlanFeatures) =>
    terms.features[feature] ? t('plan.included') : t('plan.notIncluded');

  const rows: Array<{ label: string; free: string; pro: string }> = [
    {
      label: t('plan.rowApplications'),
      free: limitCell(free.limits.applications),
      pro: limitCell(pro.limits.applications),
    },
    {
      label: t('plan.rowStorage'),
      free: formatStorageSize(free.limits.documentBytes),
      pro: formatStorageSize(pro.limits.documentBytes),
    },
    {
      label: t('plan.rowAi'),
      free: monthlyCell(free.limits.aiActionsPerMonth),
      pro: monthlyCell(pro.limits.aiActionsPerMonth),
    },
    ...FEATURE_ROWS.map(({ feature, labelKey }) => ({
      label: t(labelKey),
      free: featureCell(free, feature),
      pro: featureCell(pro, feature),
    })),
  ];

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('plan.compareTitle')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('plan.compareDescription')}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400">
              <th scope="col" className="py-2 pr-4 font-medium">
                {t('plan.colFeature')}
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                {t('plan.colFree')}
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                {t('plan.colPro')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-gray-100 dark:border-gray-800">
                <th scope="row" className="py-2 pr-4 font-normal text-gray-900 dark:text-gray-100">
                  {row.label}
                </th>
                <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{row.free}</td>
                <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{row.pro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
