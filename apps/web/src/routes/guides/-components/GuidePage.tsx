import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import type { Guide } from '@trakwyn/content';
import { GuideMarkdown } from '#/components/marketing/GuideMarkdown';
import { serializeJsonLd } from '#/components/marketing/FaqSection';
import { MarketingHeader } from '#/components/marketing/MarketingHeader';
import { MarketingFooter } from '#/components/marketing/MarketingFooter';
import { trackCta } from '#/lib/analytics';
import { buildArticleJsonLd } from '#/lib/guideFeeds';
import { useLocale } from '#/lib/i18n';

/** Feature page → the existing nav label for it. */
const FEATURE_LABEL_KEYS: Record<string, string> = {
  '/features': 'landing.features',
  '/features/tracking': 'marketing.footer.trackingLink',
  '/features/ai-assistant': 'marketing.footer.aiAssistantLink',
  '/features/resume-cover-letter': 'marketing.footer.resumeCoverLettersLink',
  '/features/analytics': 'marketing.footer.analyticsLink',
};

const DATE_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: 'long', timeZone: 'UTC' };

/**
 * `/guides/$slug`: one guide, with the `Article` JSON-LD, a link to the
 * related feature page and a sign-up call to action.
 *
 * @category Marketing
 */
export function GuidePage({ guide }: { guide: Guide }) {
  const { t, formatDate } = useLocale();
  const { title, description, date, updated, tags, feature } = guide.frontmatter;
  const featureKey = feature ? FEATURE_LABEL_KEYS[feature] : undefined;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildArticleJsonLd(guide)) }}
      />
      <MarketingHeader activeGuides />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <Link
          to="/guides"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('guides.post.back')}
        </Link>
        <article className="mt-6">
          <header>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
              {title}
            </h1>
            <p className="mt-3 text-lg text-gray-600 dark:text-gray-400">{description}</p>
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              <time dateTime={date}>
                {t('guides.post.published', { date: formatDate(date, DATE_OPTIONS) })}
              </time>
              {updated && (
                <>
                  {' · '}
                  <time dateTime={updated}>
                    {t('guides.post.updated', { date: formatDate(updated, DATE_OPTIONS) })}
                  </time>
                </>
              )}
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <li key={tag}>
                  <Link
                    to="/guides"
                    search={{ tag }}
                    className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >
                    {tag}
                  </Link>
                </li>
              ))}
            </ul>
          </header>
          <div className="mt-8">
            <GuideMarkdown slug={guide.slug}>{guide.body}</GuideMarkdown>
          </div>
        </article>

        {feature && featureKey && (
          <p className="mt-10 text-sm text-gray-600 dark:text-gray-400">
            {t('guides.post.relatedFeature')}:{' '}
            <a
              href={feature}
              className="font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              {t(featureKey)}
            </a>
          </p>
        )}

        <section className="mt-10 rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-950">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {t('guides.post.ctaTitle')}
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">{t('guides.post.ctaBody')}</p>
          <Link
            to="/register"
            onClick={() => trackCta('start_free', 'guide')}
            className="mt-5 inline-block rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            {t('landing.startFree')}
          </Link>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
