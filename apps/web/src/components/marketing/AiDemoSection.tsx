import { ArrowDown, ArrowRight, ArrowUpRight, Shield, Sparkles } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { trackCta } from '#/lib/analytics';
import { useLocale } from '#/lib/i18n';

/** Fictional, like the hero board's sample cards. Product names are not translated. */
const SAMPLE_COMPANY = 'Northwind Labs';
const SAMPLE_URL = 'careers.northwind.example/jobs/senior-product-designer';

const REQUIREMENT_KEYS = [
  'landing.aiDemo.postingReq1',
  'landing.aiDemo.postingReq2',
  'landing.aiDemo.postingReq3',
] as const;

function PanelLabel({ children }: { children: string }) {
  return (
    <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
      {children}
    </div>
  );
}

function PostingPanel() {
  const { t } = useLocale();
  return (
    <div className="flex flex-col gap-3">
      <PanelLabel>{t('landing.aiDemo.postingLabel')}</PanelLabel>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg shadow-gray-900/5 dark:border-gray-800 dark:bg-gray-800/50">
        <div className="truncate border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400">
          {SAMPLE_URL}
        </div>
        <div className="flex flex-col gap-2 p-6">
          <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
            {SAMPLE_COMPANY}
          </div>
          <div className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            {t('landing.aiDemo.postingRole')}
          </div>
          <ul className="mt-3 flex flex-col gap-2.5">
            {REQUIREMENT_KEYS.map((key) => (
              <li
                key={key}
                className="flex items-start gap-2 text-sm/6 text-gray-700 dark:text-gray-300"
              >
                <span
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-blue-600"
                  aria-hidden="true"
                />
                {t(key)}
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-2" aria-hidden="true">
            <div className="h-1.5 w-11/12 rounded-sm bg-gray-200 dark:bg-gray-700" />
            <div className="h-1.5 w-2/3 rounded-sm bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      </div>
    </div>
  );
}

function LetterPanel() {
  const { t } = useLocale();
  return (
    <div className="flex flex-col gap-3">
      <PanelLabel>{t('landing.aiDemo.letterLabel')}</PanelLabel>
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg shadow-gray-900/5 dark:border-gray-800 dark:bg-gray-800/50">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('landing.aiDemo.letterGreeting')}
        </p>
        <p className="mt-3 text-sm/7 text-gray-700 dark:text-gray-300">
          {t('landing.aiDemo.letterBody')}
        </p>
        <div className="mt-4 space-y-2" aria-hidden="true">
          <div className="h-1.5 w-full rounded-sm bg-gray-200 dark:bg-gray-700" />
          <div className="h-1.5 w-4/5 rounded-sm bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-900/20">
          <div className="flex items-center gap-1.5 text-xs font-bold text-green-700 dark:text-green-400">
            <Shield className="size-3.5" aria-hidden="true" />
            {t('landing.aiDemo.groundedBadge')}
          </div>
          <p className="mt-1.5 text-xs/relaxed text-green-800 dark:text-green-500">
            {t('landing.aiDemo.groundedNote')}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Static, illustrative "job posting → tailored cover letter" section for the
 * landing page (JEF-517). Pure markup with fictional names: no API call, so it
 * server-renders, and an anonymous visitor can never run up AI cost.
 *
 * @category Marketing
 */
export function AiDemoSection() {
  const { t } = useLocale();
  return (
    <section aria-labelledby="ai-demo-heading" className="py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-blue-700 dark:text-blue-400">
            <Sparkles className="size-4" aria-hidden="true" />
            {t('landing.aiDemo.eyebrow')}
          </div>
          <h2
            id="ai-demo-heading"
            className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl dark:text-gray-100"
          >
            {t('landing.aiDemo.title')}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
            {t('landing.aiDemo.description')}
          </p>
        </div>

        <div className="mt-14 grid items-start gap-4 md:grid-cols-[1fr_auto_1fr] md:gap-6">
          <PostingPanel />
          <span
            role="img"
            aria-label={t('landing.aiDemo.arrowLabel')}
            className="mx-auto flex size-10 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm md:mt-32"
          >
            <ArrowDown className="size-5 md:hidden" aria-hidden="true" />
            <ArrowRight className="hidden size-5 md:block" aria-hidden="true" />
          </span>
          <LetterPanel />
        </div>

        <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            to="/register"
            onClick={() => trackCta('start_free', 'ai_demo')}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            {t('landing.startFree')}
          </Link>
          <Link
            to="/features/resume-cover-letter"
            className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            {t('landing.learnMore')}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
