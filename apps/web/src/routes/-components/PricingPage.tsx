import { Link } from '@tanstack/react-router';
import { Check, Minus } from 'lucide-react';
import { MarketingHeader } from '#/components/marketing/MarketingHeader';
import { MarketingFooter } from '#/components/marketing/MarketingFooter';
import { useLocale } from '#/lib/i18n';
import { useIsLoggedIn } from '#/lib/useIsLoggedIn';

type Cell = { text: string } | { included: boolean };

interface ComparisonRow {
  labelKey: string;
  free: Cell;
  pro: Cell;
}

/**
 * The numbers here mirror `PLAN_LIMITS` and `PLAN_FEATURES` in the API's
 * `use-cases/constants.ts`; `pricingPage.test.tsx` fails if they drift.
 */
const ROWS: ComparisonRow[] = [
  {
    labelKey: 'plan.rowApplications',
    free: { text: 'pricing.freeApplications' },
    pro: { text: 'plan.unlimited' },
  },
  {
    labelKey: 'plan.rowStorage',
    free: { text: 'pricing.freeStorage' },
    pro: { text: 'pricing.proStorage' },
  },
  { labelKey: 'plan.rowAi', free: { text: 'pricing.freeAi' }, pro: { text: 'plan.unlimited' } },
  { labelKey: 'plan.rowNotifications', free: { included: false }, pro: { included: true } },
  { labelKey: 'plan.rowAnalytics', free: { included: false }, pro: { included: true } },
  { labelKey: 'plan.rowOffers', free: { included: false }, pro: { included: true } },
  { labelKey: 'plan.rowShareLinks', free: { included: false }, pro: { included: true } },
  { labelKey: 'plan.rowApiAccess', free: { included: false }, pro: { included: true } },
];

const OPTIONS = [
  {
    nameKey: 'pricing.monthlyName',
    priceKey: 'pricing.monthlyPrice',
    noteKey: 'pricing.monthlyNote',
  },
  { nameKey: 'pricing.pass3Name', priceKey: 'pricing.pass3Price', noteKey: 'pricing.passNote' },
  { nameKey: 'pricing.pass6Name', priceKey: 'pricing.pass6Price', noteKey: 'pricing.passNote' },
];

function CellValue({ cell }: { cell: Cell }) {
  const { t } = useLocale();
  if ('text' in cell) return <span>{t(cell.text)}</span>;
  return cell.included ? (
    <>
      <Check className="mx-auto size-4 text-green-600" aria-hidden="true" />
      <span className="sr-only">{t('plan.included')}</span>
    </>
  ) : (
    <>
      <Minus className="mx-auto size-4 text-gray-400" aria-hidden="true" />
      <span className="sr-only">{t('plan.notIncluded')}</span>
    </>
  );
}

/**
 * Public pricing page (JEF-441): what Free and Pro include and what Pro
 * costs. The in-app equivalent is `SettingsPlanPage`.
 *
 * @category Pages
 */
export function PricingPage() {
  const { t } = useLocale();
  const isLoggedIn = useIsLoggedIn();

  const proTo: '/settings/plan' | '/register' = isLoggedIn ? '/settings/plan' : '/register';

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <MarketingHeader activePricing />

      <main>
        <section className="mx-auto max-w-3xl px-4 pt-20 pb-12 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl dark:text-gray-100">
            {t('pricing.title')}
          </h1>
          <p className="mt-5 text-lg/8 text-gray-600 dark:text-gray-400">{t('pricing.subtitle')}</p>
        </section>

        <section className="mx-auto grid max-w-4xl gap-6 px-4 sm:grid-cols-2 sm:px-6 lg:px-8">
          <div className="flex flex-col rounded-xl border border-gray-200 p-6 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('plan.badgeFree')}
            </h2>
            <p className="mt-4 text-4xl font-bold text-gray-900 dark:text-gray-100">
              {t('pricing.freePrice')}
            </p>
            <p className="mt-3 flex-1 text-sm text-gray-600 dark:text-gray-400">
              {t('pricing.freeTagline')}
            </p>
            <Link
              to="/register"
              className="mt-6 rounded-lg border border-gray-300 px-5 py-2.5 text-center text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {t('landing.startFree')}
            </Link>
          </div>
          <div className="flex flex-col rounded-xl border-2 border-blue-600 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('plan.badgePro')}
            </h2>
            <p className="mt-4 text-4xl font-bold text-gray-900 dark:text-gray-100">
              {t('pricing.proPrice')}{' '}
              <span className="text-base font-medium text-gray-500 dark:text-gray-400">
                {t('pricing.perMonth')}
              </span>
            </p>
            <p className="mt-3 flex-1 text-sm text-gray-600 dark:text-gray-400">
              {t('pricing.proTagline')}
            </p>
            <Link
              to={proTo}
              className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              {t('plan.upgradeTitle')}
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('pricing.optionsTitle')}
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {OPTIONS.map(({ nameKey, priceKey, noteKey }) => (
              <li
                key={nameKey}
                className="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
              >
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t(nameKey)}</p>
                <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {t(priceKey)}
                </p>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t(noteKey)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-2 text-sm text-gray-500 dark:text-gray-400">
            <p>{t('legal.terms.paymentsPrices')}</p>
            <p>{t('plan.refundPolicy')}</p>
            <p>{t('pricing.byok')}</p>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 pb-24 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('plan.compareTitle')}
          </h2>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th
                    scope="col"
                    className="py-3 pr-4 font-semibold text-gray-900 dark:text-gray-100"
                  >
                    {t('plan.colFeature')}
                  </th>
                  <th
                    scope="col"
                    className="w-24 py-3 text-center font-semibold text-gray-900 sm:w-32 dark:text-gray-100"
                  >
                    {t('plan.colFree')}
                  </th>
                  <th
                    scope="col"
                    className="w-24 py-3 text-center font-semibold text-gray-900 sm:w-32 dark:text-gray-100"
                  >
                    {t('plan.colPro')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map(({ labelKey, free, pro }) => (
                  <tr key={labelKey} className="border-b border-gray-100 dark:border-gray-900">
                    <th
                      scope="row"
                      className="py-3 pr-4 font-normal text-gray-700 dark:text-gray-300"
                    >
                      {t(labelKey)}
                    </th>
                    <td className="py-3 text-center text-gray-700 dark:text-gray-300">
                      <CellValue cell={free} />
                    </td>
                    <td className="py-3 text-center text-gray-700 dark:text-gray-300">
                      <CellValue cell={pro} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
