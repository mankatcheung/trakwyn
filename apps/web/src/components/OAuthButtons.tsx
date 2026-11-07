import { useLocale } from '#/lib/i18n';
import { API_ORIGIN } from '#/lib/apiOrigin';
import { OAuthProviderLogo } from '#/components/OAuthProviderLogo';

interface OAuthButtonsProps {
  label: string;
  returnTo?: string;
  /** Called with the provider just before the browser leaves for it. */
  onSelect?: (provider: 'google' | 'github') => void;
}

export function OAuthButtons({ label, returnTo, onSelect }: OAuthButtonsProps) {
  const { t } = useLocale();
  const returnToQuery = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
  return (
    <div className="space-y-3">
      <a
        href={`${API_ORIGIN}/auth/oauth/google/start${returnToQuery}`}
        onClick={() => onSelect?.('google')}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <OAuthProviderLogo provider="google" />
        {label} {t('common.withGoogle')}
      </a>
      <a
        href={`${API_ORIGIN}/auth/oauth/github/start${returnToQuery}`}
        onClick={() => onSelect?.('github')}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <OAuthProviderLogo provider="github" />
        {label} {t('common.withGitHub')}
      </a>
    </div>
  );
}
