import { useState, type FormEvent } from 'react';
import { gqlClient } from '#/graphql/client';
import { useBillingStatus } from '#/lib/billingStatus';
import { useEmailVerification } from '#/lib/emailVerification';
import { useLocale } from '#/lib/i18n';
import { REQUEST_ACCOUNT_DELETION } from '#/lib/accountDeletion';
import { Alert, Button, Card, FormLabel, Input } from '@trakwyn/ui';
import { extractGqlError } from './shared';
import { useStepUpReauth, STEP_UP_CANCELLED } from './useStepUpReauth';

/**
 * Account deletion, on its own page rather than sitting under Export and
 * Import (JEF-204), so the one destructive action is hard to reach by
 * accident and easy to find on purpose.
 *
 * Since JEF-463 this only starts it: typing the account's email unlocks the
 * button, a fresh session is asked for (any sign-in method), and the API
 * mails a link. Following the link schedules the deletion two weeks out,
 * with time to cancel.
 */
export function SettingsDangerZonePage() {
  const { t } = useLocale();
  const { withStepUp, dialog: stepUpDialog } = useStepUpReauth();
  const { data: account } = useEmailVerification();
  const email = account?.email ?? '';
  // Only a subscription keeps charging after the account is gone (JEF-439); a pass is one-off.
  const billing = useBillingStatus();
  const hasSubscription = billing?.plan === 'pro' && billing.planSource === 'subscription';

  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const matches = email.length > 0 && typed.trim().toLowerCase() === email.toLowerCase();

  const onRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (!matches) return;
    setBusy(true);
    setError(null);
    try {
      await withStepUp(() => gqlClient.request(REQUEST_ACCOUNT_DELETION));
      setSent(true);
    } catch (err) {
      if (!(err instanceof Error && err.message === STEP_UP_CANCELLED)) {
        setError(extractGqlError(err) ?? t('data.deleteAccountFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* ── Danger zone ── */}
      <Card className="space-y-4 border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-900/20">
        <div>
          <h2 className="text-base font-semibold text-red-600">{t('data.dangerZoneTitle')}</h2>
          <p className="text-sm text-red-500 dark:text-red-400">
            {t('data.dangerZoneDescription')}
          </p>
          {hasSubscription && (
            <p className="mt-1 text-sm text-red-500 dark:text-red-400">
              {t('data.dangerZoneSubscriptionNote')}
            </p>
          )}
        </div>
        {sent ? (
          <Alert tone="success">{t('data.deleteRequestSent', { email })}</Alert>
        ) : (
          <form onSubmit={onRequest} className="space-y-3">
            <div className="max-w-sm">
              <FormLabel htmlFor="delete-confirm-email">
                {t('data.deleteConfirmEmailLabel', { email })}
              </FormLabel>
              <Input
                id="delete-confirm-email"
                type="email"
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={email}
              />
            </div>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" variant="destructive" disabled={!matches || busy}>
              {busy ? t('data.deleting') : t('data.deleteMyAccount')}
            </Button>
          </form>
        )}
      </Card>
      {stepUpDialog}
    </div>
  );
}
