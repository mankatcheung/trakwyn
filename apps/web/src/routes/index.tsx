import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { trackCta } from '#/lib/analytics';
import { hasSessionCookie } from '#/graphql/client';
import { MarketingHeader } from '#/components/marketing/MarketingHeader';
import { MarketingFooter } from '#/components/marketing/MarketingFooter';
import { AiDemoSection } from '#/components/marketing/AiDemoSection';
import { ClipperSection } from '#/components/marketing/ClipperSection';
import { FeatureRow, type FeatureRowProps } from '#/components/marketing/FeatureRow';
import { ThemedScreenshot } from '#/components/marketing/ThemedScreenshot';
import { FaqSection, type FaqItem } from '#/components/marketing/FaqSection';
import { ArrowRight } from 'lucide-react';
import { useLocale } from '#/lib/i18n';
import { marketingHead, SITE_URL } from '#/lib/seo';

const OG_TITLE = 'Trakwyn — Track every application. Tailor every cover letter.';
const OG_DESCRIPTION =
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
  description: OG_DESCRIPTION,
  url: SITE_URL,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
};

export const Route = createFileRoute('/')({
  // Real content worth indexing — unlike /login and /register (which stay
  // ssr: false, since they're utility pages behind a client-only auth
  // check, not marketing pages), this route SSRs unconditionally. The
  // logged-in CTA swap lives in a client-only effect in LandingPage below,
  // which is also why no ssr: false is needed here (see JEF-206) — the API
  // and web app are on separate domains, so hasSessionCookie() still can't
  // run on the server either way.
  head: () => marketingHead({ path: '/', title: OG_TITLE, description: OG_DESCRIPTION }),
  component: LandingPage,
});

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
    screenshot: 'board',
  },
  {
    titleKey: 'landing.assistant',
    descriptionKey: 'landing.assistantDescription',
    to: '/features/ai-assistant',
    screenshot: 'assistant',
  },
  {
    titleKey: 'landing.resumeCoverLetters',
    descriptionKey: 'landing.resumeCoverLettersDescription',
    to: '/features/resume-cover-letter',
    screenshot: 'resume',
  },
  {
    titleKey: 'landing.analytics',
    descriptionKey: 'landing.analyticsDescription',
    to: '/features/analytics',
    screenshot: 'analytics',
    pro: true,
  },
];

const stepKeys = ['landing.step1', 'landing.step2', 'landing.step3', 'landing.step4'] as const;

// Not exported on purpose (JEF-537): TanStack's code splitter leaves a route
// component alone when the file also exports it. Tests reach it through
// `Route.component`.
function LandingPage() {
  const { t } = useLocale();
  // Starts false so the client's first render matches the SSR'd markup —
  // the server can never see the session cookie (see Route.head comment
  // above), so it always renders the logged-out variant.
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <MarketingHeader />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden py-24 sm:py-32">
          <div className="absolute inset-0 -z-10 bg-linear-to-b from-blue-50 to-gray-50 dark:from-gray-900 dark:to-gray-900" />
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl dark:text-gray-100">
              {t('landing.heroTitleLine1')}
              <br />
              <span className="text-blue-600">{t('landing.heroTitleLine2')}</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg/8 text-gray-600 dark:text-gray-400">
              {t('landing.heroDescription')}
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link
                to="/register"
                onClick={() => trackCta('start_free', 'hero')}
                className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                {t('landing.startFree')}
              </Link>
              <Link
                to={authLink}
                className="rounded-lg border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {authLabel}
              </Link>
            </div>
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              {t('landing.heroTrustLine')}
            </p>
          </div>
        </section>

        {/* Hero screenshot: the board, on the first fold. Likely the LCP element (JEF-530). */}
        <section className="px-4 pb-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <ThemedScreenshot name="board" priority />
          </div>
        </section>

        {/* Static posting → cover letter sample (JEF-517) */}
        <AiDemoSection />

        {/* Features */}
        <section className="py-24 sm:py-32">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl dark:text-gray-100">
                {t('landing.everything')}
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
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
                className="text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                {t('landing.seeEverything')} →
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

        {/* How it works */}
        <section className="bg-gray-100 py-24 sm:py-32 dark:bg-gray-800/30">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl dark:text-gray-100">
                {t('landing.getStartedMinutes')}
              </h2>
            </div>
            <div className="mt-12 space-y-6">
              {stepKeys.map((stepKey, i) => (
                <div key={stepKey} className="flex items-start gap-4">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                    {i + 1}
                  </div>
                  <p className="pt-0.5 text-lg text-gray-700 dark:text-gray-300">{t(stepKey)}</p>
                </div>
              ))}
            </div>
            <p className="mt-10 text-center text-base text-gray-600 dark:text-gray-400">
              {t('landing.planFraming')}{' '}
              <Link to="/pricing" className="font-semibold text-blue-600 hover:text-blue-700">
                {t('landing.seePricing')}
              </Link>
            </p>
            <div className="mt-8 text-center">
              <Link
                to="/register"
                onClick={() => trackCta('get_started_free', 'closing')}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                {t('landing.startFree')}
                <ArrowRight className="size-4" />
              </Link>
              <p className="mx-auto mt-4 max-w-xl text-sm text-gray-600 dark:text-gray-400">
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
