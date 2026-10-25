import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Menu, X } from 'lucide-react';
import { LogoMark } from '#/components/LogoMark';
import { useLocale } from '#/lib/i18n';
import { useIsLoggedIn } from '#/lib/useIsLoggedIn';
import { MarketingThemeToggle } from './MarketingThemeToggle';
import { MarketingLocalePicker } from './MarketingLocalePicker';

interface MarketingHeaderProps {
  /** Bolds the Features nav item — set on `/features` and every `/features/*` page. */
  activeFeatures?: boolean;
  /** Bolds the setup guide nav item — set on `/ai-mcp-setup`. */
  activeGuide?: boolean;
  /** Bolds the Pricing nav item — set on `/pricing`. */
  activePricing?: boolean;
}

/**
 * Shared header for every public marketing page (`/` and `/features/*`).
 * Extracted from the old single-page `LandingPage` header (JEF-228) so the
 * five new pages don't each hand-roll their own nav.
 *
 * @category Layout
 */
export function MarketingHeader({
  activeFeatures = false,
  activeGuide = false,
  activePricing = false,
}: MarketingHeaderProps) {
  const { t } = useLocale();
  const isLoggedIn = useIsLoggedIn();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const authLink: '/dashboard' | '/login' = isLoggedIn ? '/dashboard' : '/login';
  const authLabel = isLoggedIn ? t('landing.goDashboard') : t('landing.signIn');

  return (
    <header className="border-b border-gray-200 dark:border-gray-800">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <LogoMark size={24} />
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {t('marketing.brandName')}
            </span>
          </Link>
          <div className="hidden items-center gap-6 sm:flex">
            <Link
              to="/features"
              className={
                activeFeatures
                  ? 'text-sm font-semibold text-blue-700 dark:text-blue-400'
                  : 'text-sm font-medium text-gray-700 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
              }
            >
              {t('landing.features')}
            </Link>
            <Link
              to="/pricing"
              className={
                activePricing
                  ? 'text-sm font-semibold text-blue-700 dark:text-blue-400'
                  : 'text-sm font-medium text-gray-700 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
              }
            >
              {t('marketing.nav.pricing')}
            </Link>
            <Link
              to="/ai-mcp-setup"
              className={
                activeGuide
                  ? 'text-sm font-semibold text-blue-700 dark:text-blue-400'
                  : 'text-sm font-medium text-gray-700 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
              }
            >
              {t('guides.aiMcpSetup.eyebrow')}
            </Link>
            <Link
              to={authLink}
              className="text-sm font-medium text-gray-700 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
            >
              {authLabel}
            </Link>
            <Link
              to="/register"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              {t('landing.getStarted')}
            </Link>
            <MarketingLocalePicker />
            <MarketingThemeToggle />
          </div>
          <div className="flex items-center gap-1 sm:hidden">
            <MarketingLocalePicker />
            <MarketingThemeToggle />
            <button
              type="button"
              className="p-2 text-gray-600 dark:text-gray-400"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="space-y-2 pb-4 sm:hidden">
            <Link
              to="/features"
              className={
                activeFeatures
                  ? 'block rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                  : 'block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              }
              onClick={() => setMobileMenuOpen(false)}
            >
              {t('landing.features')}
            </Link>
            <Link
              to="/pricing"
              className={
                activePricing
                  ? 'block rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                  : 'block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              }
              onClick={() => setMobileMenuOpen(false)}
            >
              {t('marketing.nav.pricing')}
            </Link>
            <Link
              to="/ai-mcp-setup"
              className={
                activeGuide
                  ? 'block rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                  : 'block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              }
              onClick={() => setMobileMenuOpen(false)}
            >
              {t('guides.aiMcpSetup.eyebrow')}
            </Link>
            <Link
              to={authLink}
              className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              onClick={() => setMobileMenuOpen(false)}
            >
              {authLabel}
            </Link>
            <Link
              to="/register"
              className="block rounded-lg bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              {t('landing.getStarted')}
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
