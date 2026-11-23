import { Link } from '@tanstack/react-router';
import { MarketingHeader } from '#/features/marketing/components/MarketingHeader';
import { MarketingFooter } from '#/features/marketing/components/MarketingFooter';
import { useLocale } from '#/lib/i18n';
import { allGuideTags, GUIDES } from '#/lib/guides';

const CHIP = 'rounded-full border px-3 py-1 text-sm font-medium transition-colors';
const CHIP_ON = 'border-blue-600 bg-blue-800 dark:bg-blue-700 text-white';
const CHIP_OFF =
  'border-stone-300 text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800';

/**
 * `/guides`: every published guide, newest first, with a tag filter. The
 * filter is the `?tag=` search param, so the prerendered page lists all guides
 * and a filtered view is a shareable link.
 *
 * @category Marketing
 */
export function GuidesIndexPage({ tag }: { tag?: string }) {
  const { t, formatDate } = useLocale();
  const tags = allGuideTags();
  const shown = tag ? GUIDES.filter((g) => g.frontmatter.tags.includes(tag)) : GUIDES;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-900">
      <MarketingHeader activeGuides />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-medium tracking-tight text-stone-900 dark:text-stone-100">
          {t('guides.index.title')}
        </h1>
        <p className="mt-3 text-lg text-stone-600 dark:text-stone-400">
          {t('guides.index.subtitle')}
        </p>

        {tags.length > 0 && (
          <nav aria-label={t('guides.index.filterLabel')} className="mt-8 flex flex-wrap gap-2">
            <Link
              to="/guides"
              aria-current={tag ? undefined : 'page'}
              className={`${CHIP} ${tag ? CHIP_OFF : CHIP_ON}`}
            >
              {t('guides.index.filterAll')}
            </Link>
            {tags.map((name) => (
              <Link
                key={name}
                to="/guides"
                search={{ tag: name }}
                aria-current={tag === name ? 'page' : undefined}
                className={`${CHIP} ${tag === name ? CHIP_ON : CHIP_OFF}`}
              >
                {name}
              </Link>
            ))}
          </nav>
        )}

        {shown.length === 0 ? (
          <p className="mt-12 text-stone-600 dark:text-stone-400">{t('guides.index.empty')}</p>
        ) : (
          <ul className="mt-10 space-y-5">
            {shown.map((guide) => (
              <li key={guide.slug}>
                <Link
                  to="/guides/$slug"
                  params={{ slug: guide.slug }}
                  className="block rounded-2xl border border-stone-200 bg-white p-6 transition-shadow hover:shadow-md dark:border-stone-800 dark:bg-stone-950"
                >
                  <h2 className="text-xl font-medium text-stone-900 dark:text-stone-100">
                    {guide.frontmatter.title}
                  </h2>
                  <p className="mt-2 text-stone-600 dark:text-stone-400">
                    {guide.frontmatter.description}
                  </p>
                  <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
                    {formatDate(guide.frontmatter.date, { dateStyle: 'long', timeZone: 'UTC' })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-10 text-sm">
          <a href="/guides/rss.xml" className="text-blue-700 hover:underline dark:text-blue-400">
            {t('guides.index.rss')}
          </a>
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
