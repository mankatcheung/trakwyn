import { Link, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { Alert } from '@trakwyn/ui';

const CONFIRM_BACKUP_EMAIL = `
  mutation ConfirmBackupEmail($token: String!) {
    confirmBackupEmail(token: $token)
  }
`;

export function ConfirmBackupEmailPage() {
  const { t } = useLocale();
  const { token } = useSearch({ from: '/confirm-backup-email' });
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    token ? 'loading' : 'error',
  );

  useEffect(() => {
    if (!token) return;
    gqlClient
      .request(CONFIRM_BACKUP_EMAIL, { token })
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-white p-8 shadow-sm dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('confirmBackupEmail.title')}
        </h1>
        {status === 'loading' && (
          <p className="text-sm text-gray-500">{t('confirmBackupEmail.verifying')}</p>
        )}
        {status === 'success' && <Alert tone="success">{t('confirmBackupEmail.success')}</Alert>}
        {status === 'error' && <Alert>{t('confirmBackupEmail.error')}</Alert>}
        <Link to="/login" className="text-sm text-blue-600 hover:underline">
          {t('auth.backToSignIn')}
        </Link>
      </div>
    </div>
  );
}
