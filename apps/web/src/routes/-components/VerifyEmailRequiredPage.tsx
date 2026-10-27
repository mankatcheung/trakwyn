import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Alert, Button, FormLabel, Input } from '@trakwyn/ui';
import { ERROR_CODES } from '#/constants';
import { gqlClient } from '#/graphql/client';
import { LogoMark } from '#/components/LogoMark';
import { getGqlErrorCode } from '#/lib/graphqlError';
import { useLocale } from '#/lib/i18n';
import { queryClient } from '#/lib/queryClient';
import {
  RESEND_COOLDOWN_SECONDS,
  RESEND_VERIFICATION_EMAIL,
  useEmailVerification,
} from '#/lib/emailVerification';
import { REQUEST_EMAIL_CHANGE } from '#/routes/_authenticated/settings/-components/shared';

const LOGOUT_MUTATION = `mutation { logout }`;

type Notice = { tone: 'success' | 'error'; text: string } | null;

/** Seconds left until a deadline, ticking once a second only while there are any. */
function useCooldown() {
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const start = (forSeconds: number) => {
    const started = Date.now();
    setNow(started);
    setEndsAt(started + forSeconds * 1000);
  };
  return [seconds, start] as const;
}

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
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [changeNotice, setChangeNotice] = useState<Notice>(null);
  const [changeBusy, setChangeBusy] = useState(false);

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

  const changeEmail = async (event: FormEvent) => {
    event.preventDefault();
    setChangeBusy(true);
    setChangeNotice(null);
    try {
      await gqlClient.request(REQUEST_EMAIL_CHANGE, { currentPassword, newEmail });
      setChangeNotice({
        tone: 'success',
        text: t('verifyRequired.changeEmailSent', { email: newEmail }),
      });
      setChanging(false);
      setCurrentPassword('');
      setNewEmail('');
    } catch (err) {
      const message =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { errors?: Array<{ message?: string }> } }).response?.errors?.[0]
              ?.message
          : undefined;
      setChangeNotice({ tone: 'error', text: message ?? t('verifyRequired.changeEmailFailed') });
    } finally {
      setChangeBusy(false);
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
            <form
              onSubmit={changeEmail}
              className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700"
            >
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('verifyRequired.changeEmailIntro')}
              </p>
              <div>
                <FormLabel htmlFor="verify-new-email">{t('security.newEmailLabel')}</FormLabel>
                <Input
                  id="verify-new-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <FormLabel htmlFor="verify-current-password">
                  {t('security.currentPasswordLabel')}
                </FormLabel>
                <Input
                  id="verify-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={changeBusy}>
                  {t('verifyRequired.changeEmailSubmit')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setChanging(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="link" onClick={() => setChanging(true)}>
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
