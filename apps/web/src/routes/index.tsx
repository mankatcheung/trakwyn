import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { hasSessionCookie } from '#/graphql/client';
import { MarketingHeader } from '#/components/marketing/MarketingHeader';
import { MarketingFooter } from '#/components/marketing/MarketingFooter';
import { ClipperSection } from '#/components/marketing/ClipperSection';
import { useLocale } from '#/lib/i18n';
import { statusColor } from '#/lib/statusColors';
import { LayoutDashboard, Sparkles, FileText, BarChart3, ArrowRight } from 'lucide-react';

const SITE_URL = 'https://www.trakwyn.com';
const OG_TITLE = 'Trakwyn — Your Job Search, Organized and Powered by AI';
const OG_DESCRIPTION =
  'Track applications on a Kanban board, get AI-drafted resumes and cover letters grounded in your real experience, and see the analytics behind your search. Everything you need to land your next role.';
const OG_IMAGE = `${SITE_URL}/logo512.png`;

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
  head: () => ({
    meta: [
      { title: OG_TITLE },
      { name: 'description', content: OG_DESCRIPTION },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: SITE_URL },
      { property: 'og:title', content: OG_TITLE },
      { property: 'og:description', content: OG_DESCRIPTION },
      { property: 'og:image', content: OG_IMAGE },
      { property: 'og:image:width', content: '512' },
      { property: 'og:image:height', content: '512' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: OG_TITLE },
      { name: 'twitter:description', content: OG_DESCRIPTION },
      { name: 'twitter:image', content: OG_IMAGE },
    ],
    links: [{ rel: 'canonical', href: SITE_URL }],
  }),
  component: LandingPage,
});

/**
 * The four deep-dive `/features/*` pages (JEF-228) — kept in the same order
 * everywhere they're listed (here, the features index, and the footer's
 * Product column) so a visitor doesn't have to re-learn the lineup.
 */
const highlightedFeatures = [
  {
    icon: LayoutDashboard,
    titleKey: 'landing.tracking',
    descriptionKey: 'landing.trackingDescription',
    to: '/features/tracking' as const,
  },
  {
    icon: Sparkles,
    titleKey: 'landing.assistant',
    descriptionKey: 'landing.assistantDescription',
    to: '/features/ai-assistant' as const,
  },
  {
    icon: FileText,
    titleKey: 'landing.resumeCoverLetters',
    descriptionKey: 'landing.resumeCoverLettersDescription',
    to: '/features/resume-cover-letter' as const,
  },
  {
    icon: BarChart3,
    titleKey: 'landing.analytics',
    descriptionKey: 'landing.analyticsDescription',
    to: '/features/analytics' as const,
  },
] as const;

const stepKeys = ['landing.step1', 'landing.step2', 'landing.step3', 'landing.step4'] as const;

/** Sample data for the hero board preview — not live, just illustrative (JEF-228). */
const HERO_BOARD_COLUMNS = [
  { status: 'applied', cards: ['Northwind Labs', 'Halcyon Data', 'Fernbridge'] },
  { status: 'interviewing', cards: ['Verdant Systems', 'Solace Group'] },
  { status: 'offered', cards: ['Mosaic & Co'] },
  { status: 'accepted', cards: [] },
] as const;

export function LandingPage() {
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
          </div>
        </section>

        {/* Hero board preview — a taste of the product on the very first fold (JEF-228) */}
        <section className="px-4 pb-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg shadow-gray-900/5 dark:border-gray-800 dark:bg-gray-800/50">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-800">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {t('landing.boardLabel')}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {t('landing.everyApplicationOneView')}
              </span>
            </div>
            <div className="flex gap-3 overflow-x-auto bg-gray-50 p-5 dark:bg-gray-900/40">
              {HERO_BOARD_COLUMNS.map((column) => {
                const colors = statusColor(column.status);
                return (
                  <div
                    key={column.status}
                    className={`w-48 shrink-0 rounded-xl border border-t-4 border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 ${colors.columnBorder}`}
                  >
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="flex items-center gap-1.5">
                        <span className={`size-2 rounded-full ${colors.dot}`} aria-hidden="true" />
                        <span className={`text-xs font-semibold ${colors.columnHeading}`}>
                          {t(`status.${column.status}`)}
                        </span>
                      </span>
                      <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                        {column.cards.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5 px-2 pb-2">
                      {column.cards.map((card) => (
                        <div
                          key={card}
                          className="rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300"
                        >
                          {card}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

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
            <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {highlightedFeatures.map((feature) => (
                <Link
                  key={feature.titleKey}
                  to={feature.to}
                  className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-colors hover:border-blue-300 dark:border-gray-800 dark:bg-gray-800/50 dark:hover:border-blue-800"
                >
                  <div className="flex size-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
                    <feature.icon className="size-5 text-blue-600" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-gray-100">
                    {t(feature.titleKey)}
                  </h3>
                  <p className="mt-2 text-sm/6 text-gray-600 dark:text-gray-400">
                    {t(feature.descriptionKey)}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-600">
                    {t('landing.learnMore')}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
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
            <div className="mt-12 text-center">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                {t('landing.getStartedFree')}
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
