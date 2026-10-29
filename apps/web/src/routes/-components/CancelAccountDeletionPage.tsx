import { useState } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { Alert, Button } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { extractGqlError } from '#/routes/_authenticated/settings/-components/shared';
import { CANCEL_ACCOUNT_DELETION } from '#/lib/accountDeletion';
import { AccountDeletionLayout } from './AccountDeletionLayout';

/**
 * Where the "cancel deletion" link in the scheduled mail lands (JEF-463).
 * Works without signing in and signs no one in; like the confirm page it
 * acts only when the button is pressed.
 */
export function CancelAccountDeletionPage() {
  const { t } = useLocale();
  const { token } = useSearch({ from: '/cancel-account-deletion' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(
    token ? null : t('accountDeletion.linkInvalid'),
  );

  const cancel = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await gqlClient.request(CANCEL_ACCOUNT_DELETION, { token });
      setDone(true);
    } catch (err) {
      setError(extractGqlError(err) ?? t('accountDeletion.linkInvalid'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountDeletionLayout title={t('accountDeletion.cancelTitle')}>
      {done ? (
        <Alert tone="success">{t('accountDeletion.cancelledBody')}</Alert>
      ) : (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t('accountDeletion.cancelBody')}
          </p>
          {error && <Alert>{error}</Alert>}
          <Button fullWidth onClick={cancel} disabled={busy || !token}>
            {busy ? t('accountDeletion.cancelling') : t('accountDeletion.cancelButton')}
          </Button>
        </>
      )}
      <Link to="/login" className="text-sm text-blue-600 hover:underline">
        {t('auth.backToSignIn')}
      </Link>
    </AccountDeletionLayout>
  );
}
