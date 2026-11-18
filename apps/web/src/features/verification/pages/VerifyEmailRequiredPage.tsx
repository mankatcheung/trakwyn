import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Alert, Button } from '@trakwyn/ui';
import { ERROR_CODES } from '#/constants';
import { gqlClient } from '#/graphql/client';
import { LogoMark } from '#/components/LogoMark';
import { getGqlErrorCode } from '#/lib/graphqlError';
import { useLocale } from '#/lib/i18n';
import { queryClient } from '#/lib/queryClient';
import { useCooldown } from '#/hooks/useCooldown';
import {
  RESEND_COOLDOWN_SECONDS,
  useEmailVerification,
} from '#/features/verification/graphql/emailVerification';
import { RESEND_VERIFICATION_EMAIL } from '#/features/verification/graphql/verificationQueries';
import { ChangeEmailForm } from '../../auth/components/ChangeEmailForm';
import { LOGOUT_MUTATION } from '#/features/auth/graphql/authQueries';

type Notice = { tone: 'success' | 'error'; text: string } | null;

/**
 * The full-page reminder an unverified user gets in place of the app
 * (JEF-438). Besides "resend", it offers the ways out of a lost or
 * mistyped verification email: check again, use a different address, or sign
 * out.
 */
export function VerifyEmailRequiredPage({ email }: { email: string }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { refetch } = useEmailVerification();
  const [checking, setChecking] = useState(false);

  const [resendNotice, setResendNotice] = useState<Notice>(null);
  const [sending, setSending] = useState(false);
  const [cooldown, startCooldown] = useCooldown();
  const [checkNotice, setCheckNotice] = useState<Notice>(null);

  const [changing, setChanging] = useState(false);
  const [changeNotice, setChangeNotice] = useState<Notice>(null);

  const resend = async () => {
    setSending(true);
    setResendNotice(null);
    try {
      await gqlClient.request(RESEND_VERIFICATION_EMAIL);
      startCooldown(RESEND_COOLDOWN_SECONDS);
      setResendNotice({ tone: 'success', text: t('verifyRequired.sent', { email }) });
    } catch (err) {
      const rateLimited = getGqlErrorCode(err) === ERROR_CODES.RATE_LIMITED;
      setResendNotice({
        tone: 'error',
        text: t(rateLimited ? 'verifyRequired.rateLimited' : 'verifyRequired.resendFailed'),
      });
    } finally {
      setSending(false);
    }
  };

  const checkAgain = async () => {
    setChecking(true);
    setCheckNotice(null);
    try {
      const { data } = await refetch();
      // Verified: the gate unmounts this page. Otherwise say so, or the click
      // looks like it did nothing.
      if (data && !data.emailVerified) {
        setCheckNotice({ tone: 'error', text: t('verifyRequired.stillUnverified') });
      }
    } finally {
      setChecking(false);
    }
  };

  const signOut = async () => {
    await gqlClient.request(LOGOUT_MUTATION);
    queryClient.clear();
    await navigate({ to: '/login' });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8 dark:bg-gray-900">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2">
          <LogoMark size={28} />
          <span className="text-xl font-bold text-gray-900 dark:text-gray-100">Trakwyn</span>
        </div>

        <div className="space-y-6 rounded-xl bg-white p-8 shadow-sm dark:bg-gray-800">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {t('verifyRequired.title')}
            </h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {t('verifyRequired.body', { email })}
            </p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {t('verifyRequired.spamHint')}
            </p>
          </div>

          {resendNotice && <Alert tone={resendNotice.tone}>{resendNotice.text}</Alert>}
          {checkNotice && <Alert tone={checkNotice.tone}>{checkNotice.text}</Alert>}
          {changeNotice && <Alert tone={changeNotice.tone}>{changeNotice.text}</Alert>}

          <div className="space-y-3">
            <Button fullWidth onClick={resend} disabled={sending || cooldown > 0}>
              {sending
                ? t('verifyRequired.sending')
                : cooldown > 0
                  ? t('verifyRequired.resendIn', { seconds: cooldown })
                  : t('verifyRequired.resend')}
            </Button>
            <Button variant="secondary" fullWidth onClick={checkAgain} disabled={checking}>
              {t('verifyRequired.checkAgain')}
            </Button>
          </div>

          {changing ? (
            <ChangeEmailForm
              onSent={(sent) => {
                setChangeNotice({
                  tone: 'success',
                  text: t('verifyRequired.changeEmailSent', { email: sent }),
                });
                setChanging(false);
              }}
              onCancel={() => setChanging(false)}
            />
          ) : (
            <Button
              variant="link"
              onClick={() => {
                setChangeNotice(null);
                setChanging(true);
              }}
            >
              {t('verifyRequired.changeEmail')}
            </Button>
          )}

          <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button variant="ghost" size="sm" onClick={signOut}>
              {t('nav.signOut')}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
