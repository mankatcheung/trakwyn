import { Link } from '@tanstack/react-router';
import { useLocale } from '#/lib/i18n';

/** The root route's `notFoundComponent`: any URL that matches no route. */
export function NotFoundPage() {
  const { t } = useLocale();
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 dark:bg-stone-900">
      <div className="space-y-4 text-center">
        <h1 className="text-4xl font-medium text-stone-900 dark:text-stone-100">404</h1>
        <p className="text-stone-500 dark:text-stone-400">{t('errors.notFound')}</p>
        <Link
          to="/dashboard"
          className="inline-block text-sm text-blue-800 dark:text-blue-400 hover:underline"
        >
          {t('errors.goDashboard')}
        </Link>
      </div>
    </div>
  );
}
