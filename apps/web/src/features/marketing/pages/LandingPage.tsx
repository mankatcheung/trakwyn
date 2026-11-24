import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { trackCta } from '#/lib/analytics';
import { hasSessionCookie } from '#/graphql/client';
import { MarketingHeader } from '#/features/marketing/components/MarketingHeader';
import { MarketingFooter } from '#/features/marketing/components/MarketingFooter';
import { AiDemoSection } from '#/features/marketing/components/AiDemoSection';
import { ClipperSection } from '#/features/marketing/components/ClipperSection';
import { FeatureRow, type FeatureRowProps } from '#/features/marketing/components/FeatureRow';
import { ThemedScreenshot } from '#/features/marketing/components/ThemedScreenshot';
import { FaqSection, type FaqItem } from '#/features/marketing/components/FaqSection';
import { useLocale } from '#/lib/i18n';
import { SITE_URL } from '#/lib/seo';

const DESCRIPTION =
  'Save jobs from any posting with one click, keep every application on one board, and get cover letters and resumes drafted from your own experience. Free to start.';

const LANDING_FAQ: readonly FaqItem[] = [
  { id: 'free', questionKey: 'faq.free.q', answerKey: 'faq.free.a' },
  { id: 'privacy', questionKey: 'faq.privacy.q', answerKey: 'faq.privacy.a' },
  { id: 'clipper', questionKey: 'faq.clipper.q', answerKey: 'faq.clipper.a' },
  { id: 'mobile', questionKey: 'faq.mobile.q', answerKey: 'faq.mobile.a' },
];

const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Trakwyn',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: DESCRIPTION,
  url: SITE_URL,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
};

/**
 * The four deep-dive `/features/*` pages (JEF-228) — kept in the same order
 * everywhere they're listed (here, the features index, and the footer's
 * Product column) so a visitor doesn't have to re-learn the lineup.
 */
const highlightedFeatures: readonly FeatureRowProps[] = [
  {
    titleKey: 'landing.tracking',
    descriptionKey: 'landing.trackingDescription',
    to: '/features/tracking',
    linkLabelKey: 'features.index.tracking.linkLabel',
    screenshot: 'crop-board-columns',
  },
  {
    titleKey: 'landing.assistant',
    descriptionKey: 'landing.assistantDescription',
    to: '/features/ai-assistant',
    linkLabelKey: 'features.index.aiAssistant.linkLabel',
    screenshot: 'crop-assistant-reply',
  },
  {
    titleKey: 'landing.resumeCoverLetters',
    descriptionKey: 'landing.resumeCoverLettersDescription',
    to: '/features/resume-cover-letter',
    linkLabelKey: 'features.index.resumeCoverLetter.linkLabel',
    screenshot: 'crop-resume-editor',
  },
  {
    titleKey: 'landing.analytics',
    descriptionKey: 'landing.analyticsDescription',
    to: '/features/analytics',
    linkLabelKey: 'features.index.analytics.linkLabel',
    screenshot: 'crop-stage-funnel',
    pro: true,
  },
];

const stepKeys = ['landing.step1', 'landing.step2', 'landing.step3', 'landing.step4'] as const;

/**
 * The landing page at `/`. The route (`routes/index.tsx`) is wiring only; it sets
 * the head and renders this. The logged-in CTA swap is a client-only effect, so
 * the server always renders the logged-out variant (JEF-206).
 */
export function LandingPage() {
  const { t } = useLocale();
  // Starts false so the client's first render matches the SSR'd markup —
  // the server can never see the session cookie (the route renders this with
  // no `ssr: false`, see JEF-206), so it always renders the logged-out variant.
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Logged-in visitors stay on the landing page — `/` is marketing content
  // worth reading at any time. The header and hero simply offer "Go to
  // dashboard" as an ordinary link instead of forcing the jump.
  useEffect(() => {
    if (hasSessionCookie()) setIsLoggedIn(true);
  }, []);

  const authLink: '/dashboard' | '/login' = isLoggedIn ? '/dashboard' : '/login';
  const authLabel = isLoggedIn ? t('landing.goDashboard') : t('landing.signIn');

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <MarketingHeader />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden pt-16 pb-10 sm:pt-20 sm:pb-12">
          <div className="absolute inset-0 -z-10 bg-linear-to-b from-blue-50 to-stone-50 dark:from-stone-900 dark:to-stone-900" />
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h1 className="text-4xl font-medium tracking-tight text-stone-900 sm:text-6xl dark:text-stone-100">
              {t('landing.heroTitleLine1')}
              <br />
              <span className="text-blue-800 dark:text-blue-400">
                {t('landing.heroTitleLine2')}
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg/8 text-stone-600 dark:text-stone-400">
              {t('landing.heroDescription')}
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link
                to="/register"
                onClick={() => trackCta('start_free', 'hero')}
                className="rounded-lg bg-blue-800 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-900"
              >
                {t('landing.startFree')}
              </Link>
              <Link
                to={authLink}
                className="rounded-lg border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                {authLabel}
              </Link>
            </div>
            <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">
              {t('landing.heroTrustLine')}
            </p>
          </div>
        </section>

        {/* Hero screenshot: the board, on the first fold. Likely the LCP element (JEF-530). */}
        {/* Wide, and edge to edge on a phone, so the board's own text stays readable (JEF-675). */}
        <section className="pb-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <ThemedScreenshot name="board" priority bleed />
          </div>
        </section>

        {/* Static posting → cover letter sample (JEF-517) */}
        <AiDemoSection />

        {/* How it works: what to do first, right after the demo (JEF-677) */}
        <section className="bg-stone-100 py-12 sm:py-16 dark:bg-stone-800/30">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-center text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl dark:text-stone-100">
              {t('landing.getStartedMinutes')}
            </h2>
            <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
              {stepKeys.map((stepKey, i) => (
                <li key={stepKey} className="flex items-start gap-4 lg:flex-col lg:gap-3">
                  <div className="w-8 shrink-0 border-t-2 border-blue-800 pt-1.5 font-mono text-sm text-stone-600 tabular-nums dark:border-blue-400 dark:text-stone-400">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <p className="pt-0.5 text-lg text-stone-700 lg:pt-0 dark:text-stone-300">
                    {t(stepKey)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section className="py-18 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl dark:text-stone-100">
                {t('landing.everything')}
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-stone-600 dark:text-stone-400">
                {t('landing.everythingDescription')}
              </p>
            </div>
            <div className="mt-16 flex flex-col gap-20 sm:gap-24">
              {highlightedFeatures.map((feature, i) => (
                <FeatureRow key={feature.titleKey} {...feature} reversed={i % 2 === 1} />
              ))}
            </div>
            <div className="mt-10 text-center">
              <Link
                to="/features"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-800 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {t('landing.seeEverything')}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* Browser extension (JEF-424) */}
        <ClipperSection />

        {/* Questions visitors ask before signing up (JEF-519) */}
        <FaqSection
          items={LANDING_FAQ.map((item) => ({
            ...item,
            values: { applications: t('pricing.freeApplications') },
          }))}
          structuredData
        />

        {/* Closing call to action: the page's one sign-up band at the end */}
        <section className="bg-stone-100 py-18 sm:py-24 dark:bg-stone-800/30">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <p className="text-center text-base text-stone-600 dark:text-stone-400">
              {t('landing.planFraming')}{' '}
              <Link
                to="/pricing"
                className="font-medium text-blue-800 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {t('landing.seePricing')}
              </Link>
            </p>
            <div className="mt-8 text-center">
              <Link
                to="/register"
                onClick={() => trackCta('get_started_free', 'closing')}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-900"
              >
                {t('landing.startFree')}
                <ArrowRight className="size-4" />
              </Link>
              <p className="mx-auto mt-4 max-w-xl text-sm text-stone-600 dark:text-stone-400">
                {t('landing.passesNote')}
              </p>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
