import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { gqlClient } from '#/graphql/client';
import { useFormAction } from '#/hooks/useFormAction';
import { useBillingStatus } from '#/features/plans/lib/billingStatus';
import { useEmailVerification } from '#/features/verification/graphql/emailVerification';
import { useLocale } from '#/lib/i18n';
import { REQUEST_ACCOUNT_DELETION } from '#/features/account-deletion/graphql/accountDeletionQueries';
import { Alert, Card, FormLabel, Input, SubmitButton } from '@trakwyn/ui';
import { extractGqlError } from '../lib/gqlErrors';
import { useStepUpReauth, isStepUpCancelled } from '../hooks/useStepUpReauth';

const confirmEmailSchema = (email: string) =>
  z.object({
    typed: z
      .string()
      .refine((value) => email.length > 0 && value.trim().toLowerCase() === email.toLowerCase()),
  });
type ConfirmEmailForm = { typed: string };

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

  // The sent state switches the card's content, so it stays local.
  const [sent, setSent] = useState(false);
  const form = useForm<ConfirmEmailForm>({
    resolver: zodResolver(confirmEmailSchema(email)),
    defaultValues: { typed: '' },
  });
  const typed = useWatch({ control: form.control, name: 'typed' });
  const matches = email.length > 0 && typed.trim().toLowerCase() === email.toLowerCase();

  const { state, formProps } = useFormAction(form, async () => {
    try {
      await withStepUp(() => gqlClient.request(REQUEST_ACCOUNT_DELETION));
      setSent(true);
      return null;
    } catch (err) {
      // Cancelling the step-up dialog is not a failure.
      if (isStepUpCancelled(err)) return null;
      return extractGqlError(err) ?? t('data.deleteAccountFailed');
    }
  });

  return (
    <div className="space-y-10">
      {/* ── Danger zone ── */}
      <Card className="space-y-4 border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-900/20">
        <div>
          <h2 className="text-base font-medium text-red-600">{t('data.dangerZoneTitle')}</h2>
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
          <form {...formProps} className="space-y-3">
            <div className="max-w-sm">
              <FormLabel htmlFor="delete-confirm-email">
                {t('data.deleteConfirmEmailLabel', { email })}
              </FormLabel>
              <Input
                id="delete-confirm-email"
                type="email"
                autoComplete="off"
                {...form.register('typed')}
                placeholder={email}
              />
            </div>
            {state.error && <Alert>{state.error}</Alert>}
            <SubmitButton
              variant="destructive"
              disabled={!matches}
              pendingLabel={t('data.deleting')}
            >
              {t('data.deleteMyAccount')}
            </SubmitButton>
          </form>
        )}
      </Card>
      {stepUpDialog}
    </div>
  );
}
