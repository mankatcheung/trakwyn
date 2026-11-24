import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Menu, X } from 'lucide-react';
import { LogoMark } from '#/components/LogoMark';
import { useLocale } from '#/lib/i18n';
import { useIsLoggedIn } from '#/features/auth/hooks/useIsLoggedIn';
import { trackCta } from '#/lib/analytics';
import { MarketingLocalePicker } from './MarketingLocalePicker';

interface MarketingHeaderProps {
  /** Bolds the Features nav item — set on `/features` and every `/features/*` page. */
  activeFeatures?: boolean;
  /** Bolds the setup guide nav item — set on `/ai-mcp-setup`. */
  activeGuide?: boolean;
  /** Bolds the Guides nav item — set on `/guides` and every `/guides/*` page. */
  activeGuides?: boolean;
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
  activeGuides = false,
  activePricing = false,
}: MarketingHeaderProps) {
  const { t } = useLocale();
  const isLoggedIn = useIsLoggedIn();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Starts false so server and first client render match; the border is always
  // present (transparent at the top) so scrolling never shifts the layout.
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const authLink: '/dashboard' | '/login' = isLoggedIn ? '/dashboard' : '/login';
  const authLabel = isLoggedIn ? t('landing.goDashboard') : t('landing.signIn');

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-colors ${
        scrolled
          ? 'border-stone-200 bg-white/90 backdrop-blur-md dark:border-stone-800 dark:bg-stone-950/90'
          : 'border-transparent'
      }`}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <LogoMark size={24} />
            <span className="text-lg font-medium text-stone-900 dark:text-stone-100">
              {t('marketing.brandName')}
            </span>
          </Link>
          <div className="hidden items-center gap-6 sm:flex">
            <Link
              to="/features"
              className={
                activeFeatures
                  ? 'text-sm font-medium text-stone-900 underline decoration-stone-400 decoration-1 underline-offset-8 dark:text-stone-100 dark:decoration-stone-500'
                  : 'text-sm font-medium text-stone-700 transition-colors hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100'
              }
            >
              {t('landing.features')}
            </Link>
            <Link
              to="/pricing"
              className={
                activePricing
                  ? 'text-sm font-medium text-stone-900 underline decoration-stone-400 decoration-1 underline-offset-8 dark:text-stone-100 dark:decoration-stone-500'
                  : 'text-sm font-medium text-stone-700 transition-colors hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100'
              }
            >
              {t('marketing.nav.pricing')}
            </Link>
            <Link
              to="/guides"
              className={
                activeGuides
                  ? 'text-sm font-medium text-stone-900 underline decoration-stone-400 decoration-1 underline-offset-8 dark:text-stone-100 dark:decoration-stone-500'
                  : 'text-sm font-medium text-stone-700 transition-colors hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100'
              }
            >
              {t('marketing.nav.guides')}
            </Link>
            <Link
              to="/ai-mcp-setup"
              className={
                activeGuide
                  ? 'text-sm font-medium text-stone-900 underline decoration-stone-400 decoration-1 underline-offset-8 dark:text-stone-100 dark:decoration-stone-500'
                  : 'text-sm font-medium text-stone-700 transition-colors hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100'
              }
            >
              {t('guides.aiMcpSetup.eyebrow')}
            </Link>
            <Link
              to={authLink}
              className="text-sm font-medium text-stone-700 transition-colors hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100"
            >
              {authLabel}
            </Link>
            <Link
              to="/register"
              onClick={() => trackCta('get_started', 'header')}
              className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-900"
            >
              {t('landing.startFree')}
            </Link>
            <MarketingLocalePicker />
          </div>
          <div className="flex items-center gap-1 sm:hidden">
            <MarketingLocalePicker />
            <Link
              to="/register"
              onClick={() => trackCta('get_started', 'header_mobile')}
              className="rounded-lg bg-blue-800 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-900"
            >
              {t('landing.startFree')}
            </Link>
            <button
              type="button"
              className="p-2 text-stone-600 dark:text-stone-400"
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
                  ? 'block rounded-lg bg-stone-100 px-3 py-2 text-sm font-medium text-stone-900 dark:bg-stone-800 dark:text-stone-100'
                  : 'block rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
              }
              onClick={() => setMobileMenuOpen(false)}
            >
              {t('landing.features')}
            </Link>
            <Link
              to="/pricing"
              className={
                activePricing
                  ? 'block rounded-lg bg-stone-100 px-3 py-2 text-sm font-medium text-stone-900 dark:bg-stone-800 dark:text-stone-100'
                  : 'block rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
              }
              onClick={() => setMobileMenuOpen(false)}
            >
              {t('marketing.nav.pricing')}
            </Link>
            <Link
              to="/guides"
              className={
                activeGuides
                  ? 'block rounded-lg bg-stone-100 px-3 py-2 text-sm font-medium text-stone-900 dark:bg-stone-800 dark:text-stone-100'
                  : 'block rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
              }
              onClick={() => setMobileMenuOpen(false)}
            >
              {t('marketing.nav.guides')}
            </Link>
            <Link
              to="/ai-mcp-setup"
              className={
                activeGuide
                  ? 'block rounded-lg bg-stone-100 px-3 py-2 text-sm font-medium text-stone-900 dark:bg-stone-800 dark:text-stone-100'
                  : 'block rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
              }
              onClick={() => setMobileMenuOpen(false)}
            >
              {t('guides.aiMcpSetup.eyebrow')}
            </Link>
            <Link
              to={authLink}
              className="block rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
              onClick={() => setMobileMenuOpen(false)}
            >
              {authLabel}
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
