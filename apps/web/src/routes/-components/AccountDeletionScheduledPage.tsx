import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Alert, Button } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { queryClient } from '#/lib/queryClient';
import { EMAIL_VERIFICATION_KEY } from '#/lib/emailVerification';
import { extractGqlError } from '#/routes/_authenticated/settings/-components/shared';
import { CANCEL_ACCOUNT_DELETION, DELETION_DATE_FORMAT } from '#/lib/accountDeletion';
import { AccountDeletionLayout } from './AccountDeletionLayout';

const LOGOUT_MUTATION = `mutation { logout }`;

/**
 * What a signed-in account scheduled for deletion gets in place of the app
 * (JEF-463): the date, and the two things it may do. Signing in never cancels
 * on its own; the owner chooses.
 */
export function AccountDeletionScheduledPage({
  deletionScheduledAt,
}: {
  deletionScheduledAt: string;
}) {
  const { t, formatDate } = useLocale();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await gqlClient.request(CANCEL_ACCOUNT_DELETION, {});
      await queryClient.invalidateQueries({ queryKey: EMAIL_VERIFICATION_KEY });
      await navigate({ to: '/dashboard' });
    } catch (err) {
      setError(extractGqlError(err) ?? t('accountDeletion.cancelFailed'));
      setBusy(false);
    }
  };

  const signOut = async () => {
    await gqlClient.request(LOGOUT_MUTATION);
    queryClient.clear();
    await navigate({ to: '/login' });
  };

  return (
    <AccountDeletionLayout title={t('accountDeletion.pendingTitle')}>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t('accountDeletion.pendingBody', {
          date: formatDate(new Date(deletionScheduledAt), DELETION_DATE_FORMAT),
        })}
      </p>
      {error && <Alert>{error}</Alert>}
      <div className="space-y-3">
        <Button fullWidth onClick={cancel} disabled={busy}>
          {busy ? t('accountDeletion.cancelling') : t('accountDeletion.cancelButton')}
        </Button>
        <Button variant="secondary" fullWidth onClick={signOut} disabled={busy}>
          {t('nav.signOut')}
        </Button>
      </div>
    </AccountDeletionLayout>
  );
}
