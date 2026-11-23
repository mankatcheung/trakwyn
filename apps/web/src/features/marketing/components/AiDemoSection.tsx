import { ArrowDown, ArrowRight, ArrowUpRight, Shield } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { ThemedScreenshot } from '#/features/marketing/components/ThemedScreenshot';
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
  return <div className="text-xs font-medium text-stone-500 dark:text-stone-400">{children}</div>;
}

function PostingPanel() {
  const { t } = useLocale();
  return (
    <div className="flex flex-col gap-3">
      <PanelLabel>{t('landing.aiDemo.postingLabel')}</PanelLabel>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-800/50">
        <div className="truncate border-b border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-500 dark:border-stone-800 dark:bg-stone-900/60 dark:text-stone-400">
          {SAMPLE_URL}
        </div>
        <div className="flex flex-col gap-2 p-6">
          <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
            {SAMPLE_COMPANY}
          </div>
          <div className="text-xl font-medium tracking-tight text-stone-900 dark:text-stone-100">
            {t('landing.aiDemo.postingRole')}
          </div>
          <ul className="mt-3 flex flex-col gap-2.5">
            {REQUIREMENT_KEYS.map((key) => (
              <li
                key={key}
                className="flex items-start gap-2 text-sm/6 text-stone-700 dark:text-stone-300"
              >
                <span
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-blue-800"
                  aria-hidden="true"
                />
                {t(key)}
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-2" aria-hidden="true">
            <div className="h-1.5 w-11/12 rounded-sm bg-stone-200 dark:bg-stone-700" />
            <div className="h-1.5 w-2/3 rounded-sm bg-stone-200 dark:bg-stone-700" />
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
      <ThemedScreenshot name="cover-letter" />
      <div className="flex items-start gap-2 text-xs/relaxed text-green-800 dark:text-green-500">
        <Shield className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <p>
          <span className="font-medium">{t('landing.aiDemo.groundedBadge')}.</span>{' '}
          {t('landing.aiDemo.groundedNote')}
        </p>
      </div>
    </div>
  );
}

/**
 * Static, illustrative "job posting → tailored cover letter" section for the
 * landing page (JEF-517): a mock posting beside a real screenshot of the letter
 * editor (JEF-530). No API call, so it server-renders, and an anonymous visitor
 * can never run up AI cost.
 *
 * @category Marketing
 */
export function AiDemoSection() {
  const { t } = useLocale();
  return (
    <section aria-labelledby="ai-demo-heading" className="py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="text-sm font-medium text-stone-600 dark:text-stone-300">
            {t('landing.aiDemo.eyebrow')}
          </div>
          <h2
            id="ai-demo-heading"
            className="mt-4 text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl dark:text-stone-100"
          >
            {t('landing.aiDemo.title')}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-stone-600 dark:text-stone-400">
            {t('landing.aiDemo.description')}
          </p>
        </div>

        <div className="mt-14 grid items-start gap-4 md:grid-cols-[1fr_auto_1fr] md:gap-6">
          <PostingPanel />
          <span
            role="img"
            aria-label={t('landing.aiDemo.arrowLabel')}
            className="mx-auto flex size-10 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 md:mt-32"
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
            className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-900"
          >
            {t('landing.startFree')}
          </Link>
          <Link
            to="/features/resume-cover-letter"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-800 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {t('landing.learnMore')}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
