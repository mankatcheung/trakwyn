import { useId } from 'react';
import { Link, type LinkProps } from '@tanstack/react-router';
import { trackCta, type CtaLocation } from '#/lib/analytics';
import { useLocale } from '#/lib/i18n';

export interface MarketingClosingCtaProps {
  /** The page's own closing line; each page says what it showed. */
  headline: string;
  /** Reported with the click when set. */
  location?: CtaLocation;
  /** A quieter second link beside the button, such as "See pricing". */
  secondaryLink?: { to: LinkProps['to']; label: string };
}

/**
 * The closing call to action of the marketing pages (JEF-676): a quiet stone
 * surface with the accent only on the button, so the screenshots stay the
 * richest thing on the page. One component, a headline per page.
 *
 * @category Layout
 */
export function MarketingClosingCta({
  headline,
  location,
  secondaryLink,
}: MarketingClosingCtaProps) {
  const { t } = useLocale();
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="border-t border-stone-200 bg-stone-100 px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8 dark:border-stone-800 dark:bg-stone-800/40"
    >
      <h2
        id={headingId}
        className="mx-auto max-w-2xl text-2xl font-medium tracking-tight text-stone-900 sm:text-3xl dark:text-stone-100"
      >
        {headline}
      </h2>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        <Link
          to="/register"
          onClick={location ? () => trackCta('get_started_free', location) : undefined}
          className="inline-block rounded-lg bg-blue-800 px-7 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-900"
        >
          {t('landing.startFree')}
        </Link>
        {secondaryLink && (
          <Link
            to={secondaryLink.to}
            className="text-sm font-medium text-blue-800 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {secondaryLink.label}
          </Link>
        )}
      </div>
    </section>
  );
}
