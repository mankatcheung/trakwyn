import { useEffect, useState } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { Alert } from '@trakwyn/ui';

const VERIFY_EMAIL_MUTATION = `
  mutation VerifyEmail($token: String!) {
    verifyEmail(token: $token)
  }
`;

type Status = 'verifying' | 'success' | 'error';

function extractGqlError(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = (err as { response?: { errors?: Array<{ message?: string }> } }).response;
    return r?.errors?.[0]?.message ?? null;
  }
  return null;
}

export function VerifyEmailPage() {
  const { t } = useLocale();
  const { token } = useSearch({ from: '/verify-email' });
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'error');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    gqlClient
      .request(VERIFY_EMAIL_MUTATION, { token })
      .then(() => {
        if (!cancelled) setStatus('success');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(extractGqlError(err) ?? t('verifyEmail.failed'));
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [token, t]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-white p-8 shadow-sm dark:bg-gray-800">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('verifyEmail.title')}
          </h1>
        </div>

        {status === 'verifying' && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('confirmBackupEmail.verifying')}
          </p>
        )}

        {status === 'success' && <Alert tone="success">{t('verifyEmail.success')}</Alert>}

        {status === 'error' && <Alert>{token ? errorMessage : t('verifyEmail.invalidLink')}</Alert>}

        <p className="text-sm text-gray-500 dark:text-gray-400">
          <Link to="/login" className="text-blue-600 hover:underline">
            {t('auth.backToSignIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
