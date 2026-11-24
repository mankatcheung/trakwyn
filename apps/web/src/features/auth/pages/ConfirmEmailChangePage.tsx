import { useEffect, useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { gqlClient } from '#/graphql/client';
import { CONFIRM_EMAIL_CHANGE_MUTATION } from '#/features/auth/graphql/authQueries';
import { useLocale } from '#/lib/i18n';
import { Alert } from '@trakwyn/ui';

type Status = 'confirming' | 'success' | 'error';

export function ConfirmEmailChangePage() {
  const { t } = useLocale();
  const { token } = useSearch({ from: '/confirm-email-change' });
  const [status, setStatus] = useState<Status>(token ? 'confirming' : 'error');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    gqlClient
      .request(CONFIRM_EMAIL_CHANGE_MUTATION, { token })
      .then(() => {
        if (!cancelled) setStatus('success');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(extractGqlError(err) ?? t('confirmEmailChange.failed'));
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [token, t]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 dark:bg-stone-900">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-white p-8 shadow-sm dark:bg-stone-800">
        <div>
          <h1 className="text-2xl font-medium text-stone-900 dark:text-stone-100">
            {t('confirmEmailChange.title')}
          </h1>
        </div>

        {status === 'confirming' && (
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {t('confirmEmailChange.confirming')}
          </p>
        )}

        {status === 'success' && <Alert tone="success">{t('confirmEmailChange.success')}</Alert>}

        {status === 'error' && (
          <Alert>{token ? errorMessage : t('confirmEmailChange.invalidLink')}</Alert>
        )}

        <p className="text-sm text-stone-500 dark:text-stone-400">
          <a href="/login" className="text-blue-800 dark:text-blue-400 hover:underline">
            {t('auth.backToSignIn')}
          </a>
        </p>
      </div>
    </div>
  );
}

function extractGqlError(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = (err as { response?: { errors?: Array<{ message?: string }> } }).response;
    return r?.errors?.[0]?.message ?? null;
  }
  return null;
}
