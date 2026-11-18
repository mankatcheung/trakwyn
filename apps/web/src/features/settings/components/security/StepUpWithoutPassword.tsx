import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { gqlClient } from '#/graphql/client';
import { API_ORIGIN } from '#/lib/apiOrigin';
import { useLocale } from '#/lib/i18n';
import { useFormAction } from '#/hooks/useFormAction';
import { OAuthProviderLogo } from '#/features/auth/components/OAuthProviderLogo';
import { Alert, Button, FormLabel, Input, SubmitButton } from '@trakwyn/ui';
import {
  REQUEST_STEP_UP_CODE,
  START_OAUTH_REAUTH,
  VERIFY_STEP_UP_CODE,
} from '../../graphql/securityQueries';
import { extractGqlError } from '../../lib/gqlErrors';

/** The emailed code is six digits, like the authenticator code. */
const stepUpCodeSchema = z.object({
  code: z.string().trim().length(6, 'Enter the 6-digit code'),
});
type StepUpCodeForm = z.infer<typeof stepUpCodeSchema>;

/** A provider that can prove a fresh sign-in; only Google today (JEF-463). */
export type ReauthProvider = 'google';

/**
 * Leaves for the provider's sign-in page; the API sends the browser back to
 * this page with `?stepUp=1` (or `?stepUpError=…`) and a refreshed session.
 * The action that asked for the step-up does not resume across the redirect,
 * so the person presses it again.
 */
async function reauthenticateWith(provider: ReauthProvider): Promise<void> {
  const { startOAuthReauth: ticket } = (await gqlClient.request(START_OAUTH_REAUTH, {
    provider,
  })) as { startOAuthReauth: string };
  const returnTo = `${window.location.pathname}${window.location.search}`;
  const query = new URLSearchParams({ mode: 'reauth', ticket, returnTo });
  window.location.assign(`${API_ORIGIN}/auth/oauth/${provider}/start?${query.toString()}`);
}

/**
 * Step-up for an account with no password (JEF-463): sign in again with a
 * provider that can prove it, or a code mailed to the account.
 */
export function StepUpWithoutPassword({
  providers,
  onSuccess,
  onCancel,
}: {
  providers: ReauthProvider[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const form = useForm<StepUpCodeForm>({
    resolver: zodResolver(stepUpCodeSchema),
    defaultValues: { code: '' },
  });
  const code = useWatch({ control: form.control, name: 'code' });
  const codeError = form.formState.errors.code;

  const withProvider = async (provider: ReauthProvider) => {
    setError(null);
    setRedirecting(true);
    try {
      await reauthenticateWith(provider);
    } catch (err) {
      setRedirecting(false);
      setError(extractGqlError(err) ?? t('stepUpReauth.verificationFailed'));
    }
  };

  const sendCode = async () => {
    setError(null);
    setSending(true);
    try {
      await gqlClient.request(REQUEST_STEP_UP_CODE);
      setCodeSent(true);
    } catch (err) {
      setError(extractGqlError(err) ?? t('stepUpReauth.sendCodeFailed'));
    } finally {
      setSending(false);
    }
  };

  // Nothing cached changes here, so a direct call is fine (step-up).
  const { state: verifyState, formProps } = useFormAction(form, async (data) => {
    setError(null);
    try {
      await gqlClient.request(VERIFY_STEP_UP_CODE, { code: data.code });
      onSuccess();
      return null;
    } catch (err) {
      return extractGqlError(err) ?? t('stepUpReauth.verificationFailed');
    }
  });

  return (
    <div className="space-y-4">
      {providers.map((provider) => (
        <Button
          key={provider}
          variant="secondary"
          fullWidth
          onClick={() => void withProvider(provider)}
          disabled={redirecting}
        >
          <OAuthProviderLogo provider={provider} />
          {t('stepUpReauth.continueWithGoogle')}
        </Button>
      ))}

      <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {codeSent ? t('stepUpReauth.codeSent') : t('stepUpReauth.emailCodeIntro')}
        </p>
        {codeSent ? (
          <form {...formProps} className="space-y-3">
            <div>
              <FormLabel htmlFor="step-up-code">{t('stepUpReauth.emailCodeLabel')}</FormLabel>
              <Input
                id="step-up-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                {...form.register('code')}
                invalid={!!codeError}
                placeholder="123456"
                autoFocus
              />
              {codeError && <p className="mt-1 text-xs text-red-600">{codeError.message}</p>}
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="link" onClick={() => void sendCode()} disabled={sending}>
                {t('stepUpReauth.resendCode')}
              </Button>
              <SubmitButton disabled={code.trim().length === 0} pendingLabel={t('auth.verifying')}>
                {t('stepUpReauth.verifyCode')}
              </SubmitButton>
            </div>
          </form>
        ) : (
          <Button variant="secondary" onClick={() => void sendCode()} disabled={sending}>
            {sending ? t('verifyRequired.sending') : t('stepUpReauth.sendCode')}
          </Button>
        )}
      </div>

      {(error ?? verifyState.error) && <Alert>{error ?? verifyState.error}</Alert>}
      <div className="flex justify-end">
        <Button variant="link" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
