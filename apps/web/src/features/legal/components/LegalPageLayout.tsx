import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { LogoMark } from '#/components/LogoMark';
import { useLocale } from '#/lib/i18n';

interface LegalPageLayoutProps {
  /** Translation key for the page title — resolved here so the h1 localizes too. */
  titleKey: string;
  /** Date string parseable by `new Date()` (e.g. 'August 22, 2026'); rendered via formatDate. */
  lastUpdated: string;
  children: ReactNode;
}

/**
 * Shared shell for /privacy, /terms and /accessibility — a real static/SSR'd
 * page (none of those routes sets `ssr: false`, since unlike /login or
 * /register there's no client-only cookie check gating them), styled like the
 * narrow auth-page card family (login.tsx/register.tsx) but wider, since a
 * policy document needs room a one-field form doesn't.
 *
 * @category Layout
 */
export function LegalPageLayout({ titleKey, lastUpdated, children }: LegalPageLayoutProps) {
  const { t, formatDate } = useLocale();
  return (
    <main className="min-h-screen bg-stone-50 px-4 py-12 sm:py-16 dark:bg-stone-900">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Link to="/" className="flex items-center justify-center gap-2">
          <LogoMark size={28} />
          <span className="text-xl font-medium text-stone-900 dark:text-stone-100">
            {t('marketing.brandName')}
          </span>
        </Link>
        <div className="rounded-xl bg-white p-8 shadow-sm sm:p-10 dark:bg-stone-800">
          <h1 className="text-2xl font-medium text-stone-900 dark:text-stone-100">{t(titleKey)}</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {t('legal.lastUpdated', { date: formatDate(lastUpdated, { dateStyle: 'long' }) })}
          </p>
          <div className="prose prose-sm prose-stone mt-8 max-w-none prose-headings:font-medium prose-strong:font-medium prose-code:font-medium text-stone-700 dark:text-stone-300 dark:prose-invert">
            {children}
          </div>
        </div>
        <p className="text-center text-sm text-stone-500 dark:text-stone-400">
          <Link to="/" className="hover:text-stone-700 dark:hover:text-stone-300">
            {t('legal.backToHome')}
          </Link>
        </p>
      </div>
    </main>
  );
}
