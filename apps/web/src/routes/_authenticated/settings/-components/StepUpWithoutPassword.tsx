import { useState, type FormEvent } from 'react';
import { gqlClient } from '#/graphql/client';
import { API_ORIGIN } from '#/lib/apiOrigin';
import { useLocale } from '#/lib/i18n';
import { OAuthProviderLogo } from '#/components/OAuthProviderLogo';
import { Alert, Button, FormLabel, Input } from '@trakwyn/ui';
import { extractGqlError } from './shared';

export const START_OAUTH_REAUTH = `
  mutation StartOAuthReauth($provider: OAuthProvider!) {
    startOAuthReauth(provider: $provider)
  }
`;
export const REQUEST_STEP_UP_CODE = `mutation RequestStepUpCode { requestStepUpCode }`;
export const VERIFY_STEP_UP_CODE = `
  mutation VerifyStepUpCode($code: String!) {
    verifyStepUpCode(code: $code)
  }
`;

/** A provider that can prove a fresh sign-in; only Google today (JEF-463). */
export type ReauthProvider = 'google';

/**
 * Leaves for the provider's sign-in page; the API sends the browser back to
 * this page with `?stepUp=1` (or `?stepUpError=…`) and a refreshed session.
 * The action that asked for the step-up does not resume across the redirect,
 * so the person presses it again.
 */
async function reauthenticateWith(provider: ReauthProvider): Promise<void> {
  const { startOAuthReauth: ticket } = await gqlClient.request<{ startOAuthReauth: string }>(
    START_OAUTH_REAUTH,
    { provider },
  );
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
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState('');

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

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setVerifying(true);
    try {
      await gqlClient.request(VERIFY_STEP_UP_CODE, { code: code.trim() });
      onSuccess();
    } catch (err) {
      setError(extractGqlError(err) ?? t('stepUpReauth.verificationFailed'));
      setVerifying(false);
    }
  };

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
          <form onSubmit={verify} className="space-y-3">
            <div>
              <FormLabel htmlFor="step-up-code">{t('stepUpReauth.emailCodeLabel')}</FormLabel>
              <Input
                id="step-up-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                autoFocus
              />
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="link" onClick={() => void sendCode()} disabled={sending}>
                {t('stepUpReauth.resendCode')}
              </Button>
              <Button type="submit" disabled={verifying || code.trim().length === 0}>
                {verifying ? t('auth.verifying') : t('stepUpReauth.verifyCode')}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" onClick={() => void sendCode()} disabled={sending}>
            {sending ? t('verifyRequired.sending') : t('stepUpReauth.sendCode')}
          </Button>
        )}
      </div>

      {error && <Alert>{error}</Alert>}
      <div className="flex justify-end">
        <Button variant="link" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
