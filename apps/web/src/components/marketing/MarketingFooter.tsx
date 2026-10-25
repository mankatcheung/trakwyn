import { Link } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';
import { CLIPPER_WEB_STORE_URL } from '#/constants';
import { LogoMark } from '#/components/LogoMark';
import { LegalFooterLinks } from '#/components/LegalFooterLinks';
import { useLocale } from '#/lib/i18n';
import { useIsLoggedIn } from '#/lib/useIsLoggedIn';

/**
 * Shared footer for every public marketing page (`/` and `/features/*`).
 * Adds a Product link column pointing at the four feature deep-dive pages
 * (JEF-228) on top of the legal links every non-landing page already carries
 * via {@link LegalFooterLinks}.
 *
 * @category Layout
 */
export function MarketingFooter() {
  const { t } = useLocale();
  const isLoggedIn = useIsLoggedIn();

  const authLink: '/dashboard' | '/login' = isLoggedIn ? '/dashboard' : '/login';
  const authLabel = isLoggedIn ? t('landing.goDashboard') : t('landing.signIn');

  return (
    <footer className="border-t border-gray-200 dark:border-gray-800">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2">
              <LogoMark size={22} />
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {t('marketing.brandName')}
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-sm/6 text-gray-500 dark:text-gray-400">
              {t('marketing.footer.tagline')}
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold tracking-wide text-gray-400 uppercase dark:text-gray-500">
              {t('marketing.footer.productHeading')}
            </div>
            <div className="mt-3.5 flex flex-col gap-2.5">
              <Link
                to="/features/tracking"
                className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                {t('marketing.footer.trackingLink')}
              </Link>
              <Link
                to="/features/ai-assistant"
                className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                {t('marketing.footer.aiAssistantLink')}
              </Link>
              <Link
                to="/features/resume-cover-letter"
                className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                {t('marketing.footer.resumeCoverLettersLink')}
              </Link>
              <Link
                to="/features/analytics"
                className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                {t('marketing.footer.analyticsLink')}
              </Link>
              <Link
                to="/pricing"
                className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                {t('marketing.footer.pricingLink')}
              </Link>
              <a
                href={CLIPPER_WEB_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                {t('marketing.footer.clipperLink')}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold tracking-wide text-gray-400 uppercase dark:text-gray-500">
              {t('marketing.footer.accountHeading')}
            </div>
            <div className="mt-3.5 flex flex-col gap-2.5">
              <Link
                to={authLink}
                className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                {authLabel}
              </Link>
              <Link
                to="/register"
                className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                {t('auth.register')}
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center gap-4 border-t border-gray-200 pt-6 sm:flex-row sm:justify-between dark:border-gray-800">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {t('marketing.footer.copyright', { year: new Date().getFullYear() })}
          </span>
          <LegalFooterLinks className="flex max-w-xs flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-500 sm:max-w-none dark:text-gray-400" />
        </div>
      </div>
    </footer>
  );
}
