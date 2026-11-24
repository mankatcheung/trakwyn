import { Link } from '@tanstack/react-router';
import { AlertTriangleIcon } from 'lucide-react';
import { useLocale } from '#/lib/i18n';
import { RouteErrorReporter } from '#/components/RouteErrorReporter';
import { StaleChunkReloader } from '#/components/StaleChunkReloader';
import { isStaleChunkError } from '#/lib/staleChunkReload';

interface RouteErrorPageProps {
  error: unknown;
}

// TanStack Router's catch-all for a render-time exception anywhere in the
// route tree — without this, an uncaught error just blanks the page. The
// error is also the only one PostHog's own autocapture cannot see: React
// swallows it at the boundary rather than letting it reach `window.onerror`,
// so RouteErrorReporter reports it explicitly (JEF-349).
export function RouteErrorPage({ error }: RouteErrorPageProps) {
  const { t } = useLocale();
  // A route chunk that 404s because the tab predates a deploy is not a bug to
  // report: reload once to pick up the new build (see staleChunkReload.ts).
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 dark:bg-stone-900">
      <StaleChunkReloader error={error} />
      {!isStaleChunkError(error) && <RouteErrorReporter error={error} />}
      <div className="space-y-4 text-center">
        <AlertTriangleIcon size={40} className="mx-auto text-red-500" />
        <h1 className="text-2xl font-medium text-stone-900 dark:text-stone-100">
          {t('errors.somethingWrong')}
        </h1>
        <p className="text-stone-500 dark:text-stone-400">{t('errors.reloadHelp')}</p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-blue-800 dark:bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-900 dark:hover:bg-blue-700"
          >
            {t('errors.reload')}
          </button>
          <Link
            to="/dashboard"
            className="text-sm text-blue-800 dark:text-blue-400 hover:underline"
          >
            {t('errors.goDashboard')}
          </Link>
        </div>
      </div>
    </div>
  );
}
