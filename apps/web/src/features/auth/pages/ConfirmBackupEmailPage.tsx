import { Link, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { Alert } from '@trakwyn/ui';
import { CONFIRM_BACKUP_EMAIL_MUTATION } from '#/features/auth/graphql/authQueries';

export function ConfirmBackupEmailPage() {
  const { t } = useLocale();
  const { token } = useSearch({ from: '/confirm-backup-email' });
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    token ? 'loading' : 'error',
  );

  useEffect(() => {
    if (!token) return;
    gqlClient
      .request(CONFIRM_BACKUP_EMAIL_MUTATION, { token })
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 dark:bg-stone-900">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-white p-8 shadow-sm dark:bg-stone-800">
        <h1 className="text-2xl font-medium text-stone-900 dark:text-stone-100">
          {t('confirmBackupEmail.title')}
        </h1>
        {status === 'loading' && (
          <p className="text-sm text-stone-500">{t('confirmBackupEmail.verifying')}</p>
        )}
        {status === 'success' && <Alert tone="success">{t('confirmBackupEmail.success')}</Alert>}
        {status === 'error' && <Alert>{t('confirmBackupEmail.error')}</Alert>}
        <Link to="/login" className="text-sm text-blue-800 dark:text-blue-400 hover:underline">
          {t('auth.backToSignIn')}
        </Link>
      </div>
    </div>
  );
}
