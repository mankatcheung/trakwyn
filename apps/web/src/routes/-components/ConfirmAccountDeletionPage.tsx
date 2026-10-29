import { useState } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { Alert, Button } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { queryClient } from '#/lib/queryClient';
import { extractGqlError } from '#/routes/_authenticated/settings/-components/shared';
import { CONFIRM_ACCOUNT_DELETION, DELETION_DATE_FORMAT } from '#/lib/accountDeletion';
import { AccountDeletionLayout } from './AccountDeletionLayout';

/**
 * Where the "confirm deletion" mail lands (JEF-463). Nothing happens on load:
 * mail scanners open links, so the deletion is scheduled only when the person
 * presses the button. Needs no session, so it works on any device.
 */
export function ConfirmAccountDeletionPage() {
  const { t, formatDate } = useLocale();
  const { token } = useSearch({ from: '/confirm-account-deletion' });
  const [busy, setBusy] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    token ? null : t('accountDeletion.linkInvalid'),
  );

  const confirm = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await gqlClient.request<{ confirmAccountDeletion: string }>(
        CONFIRM_ACCOUNT_DELETION,
        { token },
      );
      // Every session was ended; nothing cached belongs to a signed-in user now.
      queryClient.clear();
      setScheduledFor(res.confirmAccountDeletion);
    } catch (err) {
      setError(extractGqlError(err) ?? t('accountDeletion.linkInvalid'));
    } finally {
      setBusy(false);
    }
  };

  if (scheduledFor) {
    return (
      <AccountDeletionLayout title={t('accountDeletion.scheduledTitle')}>
        <Alert tone="success">
          {t('accountDeletion.scheduledBody', {
            date: formatDate(new Date(scheduledFor), DELETION_DATE_FORMAT),
          })}
        </Alert>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t('accountDeletion.scheduledCancelHint')}
        </p>
        <Link to="/" className="text-sm text-blue-600 hover:underline">
          {t('accountDeletion.backHome')}
        </Link>
      </AccountDeletionLayout>
    );
  }

  return (
    <AccountDeletionLayout title={t('accountDeletion.confirmTitle')}>
      <p className="text-sm text-gray-600 dark:text-gray-300">{t('accountDeletion.confirmBody')}</p>
      {error && <Alert>{error}</Alert>}
      <Button variant="destructive" fullWidth onClick={confirm} disabled={busy || !token}>
        {busy ? t('accountDeletion.confirming') : t('accountDeletion.confirmButton')}
      </Button>
      <Link to="/" className="text-sm text-blue-600 hover:underline">
        {t('accountDeletion.keepAccount')}
      </Link>
    </AccountDeletionLayout>
  );
}
