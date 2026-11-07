import { useState } from 'react';
import { Alert, Button } from '@trakwyn/ui';
import { ERROR_CODES } from '#/constants';
import { gqlClient } from '#/graphql/client';
import { getGqlErrorCode } from '#/lib/graphqlError';
import { useLocale } from '#/lib/i18n';
import { RESEND_COOLDOWN_SECONDS, RESEND_VERIFICATION_EMAIL } from '#/lib/emailVerification';
import { useCooldown } from '#/lib/useCooldown';

type Notice = { tone: 'success' | 'error'; text: string } | null;

/** A resend button for the signed-in user's verification email, with its own cooldown and result. */
export function ResendVerificationEmail({ email }: { email: string }) {
  const { t } = useLocale();
  const [notice, setNotice] = useState<Notice>(null);
  const [sending, setSending] = useState(false);
  const [cooldown, startCooldown] = useCooldown();

  const resend = async () => {
    setSending(true);
    setNotice(null);
    try {
      await gqlClient.request(RESEND_VERIFICATION_EMAIL);
      startCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice({ tone: 'success', text: t('verifyRequired.sent', { email }) });
    } catch (err) {
      const rateLimited = getGqlErrorCode(err) === ERROR_CODES.RATE_LIMITED;
      setNotice({
        tone: 'error',
        text: t(rateLimited ? 'verifyRequired.rateLimited' : 'verifyRequired.resendFailed'),
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <Button variant="secondary" fullWidth onClick={resend} disabled={sending || cooldown > 0}>
        {sending
          ? t('verifyRequired.sending')
          : cooldown > 0
            ? t('verifyRequired.resendIn', { seconds: cooldown })
            : t('verifyRequired.resend')}
      </Button>
    </div>
  );
}
