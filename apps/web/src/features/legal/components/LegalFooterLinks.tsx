import { Link } from '@tanstack/react-router';
import { useLocale } from '#/lib/i18n';
import { requestOpenCookiePreferences } from '#/features/legal/lib/cookieConsent';

interface LegalFooterLinksProps {
  className?: string;
}

/**
 * Privacy/Terms/Accessibility/Cookie-preferences links, shared by every page
 * that isn't the landing page (which has its own footer with the same links
 * inline) — /login and the authenticated app shell both use this so the
 * links are reachable everywhere, not just from `/` and `/register`.
 */
export function LegalFooterLinks({ className }: LegalFooterLinksProps) {
  const { t } = useLocale();

  return (
    <div
      className={
        className ??
        'flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-stone-400 [&>*]:whitespace-nowrap'
      }
    >
      <Link to="/privacy" className="hover:text-stone-600 dark:hover:text-stone-300">
        {t('auth.privacyPolicy')}
      </Link>
      <Link to="/terms" className="hover:text-stone-600 dark:hover:text-stone-300">
        {t('auth.termsOfService')}
      </Link>
      <Link to="/accessibility" className="hover:text-stone-600 dark:hover:text-stone-300">
        {t('auth.accessibility')}
      </Link>
      <button
        type="button"
        onClick={requestOpenCookiePreferences}
        className="hover:text-stone-600 dark:hover:text-stone-300"
      >
        {t('cookieConsent.footerLink')}
      </button>
    </div>
  );
}
