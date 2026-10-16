import { Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { gqlClient } from '#/graphql/client';
import { CaptchaWidget } from '#/components/CaptchaWidget';
import { useCaptcha } from '#/lib/useCaptcha';
import { useLocale } from '#/lib/i18n';
import { Alert, Button, FormLabel, Input } from '@trakwyn/ui';

const schema = z.object({
  email: z.string().email('Invalid email'),
});
type FormValues = z.infer<typeof schema>;

const REQUEST_PASSWORD_RESET_MUTATION = `
  mutation RequestPasswordReset($email: String!, $captchaToken: String) {
    requestPasswordReset(email: $email, captchaToken: $captchaToken)
  }
`;

const REQUEST_BACKUP_EMAIL_RECOVERY_MUTATION = `
  mutation RequestBackupEmailRecovery($backupEmail: String!) {
    requestBackupEmailRecovery(backupEmail: $backupEmail)
  }
`;

export function ForgotPasswordPage() {
  const { t } = useLocale();
  const [recoveryMode, setRecoveryMode] = useState<'primary' | 'backup'>('primary');
  const captcha = useCaptcha();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    // Always resolves — the backend responds identically for known and unknown
    // emails so this form can't be used to enumerate accounts.
    if (recoveryMode === 'backup') {
      await gqlClient.request(REQUEST_BACKUP_EMAIL_RECOVERY_MUTATION, { backupEmail: data.email });
      return;
    }
    try {
      await gqlClient.request(REQUEST_PASSWORD_RESET_MUTATION, {
        ...data,
        captchaToken: captcha.token,
      });
    } catch (err: unknown) {
      // A captcha token works once, so a refused request needs a fresh one.
      captcha.reset();
      throw err;
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-white p-8 shadow-sm dark:bg-gray-800">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('forgotPassword.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {recoveryMode === 'backup'
              ? t('forgotPassword.backupDescription')
              : t('forgotPassword.primaryDescription')}
          </p>
        </div>

        {isSubmitSuccessful ? (
          <Alert tone="success">{t('forgotPassword.successMessage')}</Alert>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <FormLabel htmlFor="email">{t('auth.email')}</FormLabel>
              <Input
                id="email"
                type="email"
                {...register('email')}
                invalid={!!errors.email}
                placeholder="you@example.com"
              />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>

            {recoveryMode === 'primary' && (
              <CaptchaWidget key={captcha.widgetKey} onToken={captcha.setToken} />
            )}

            <Button
              type="submit"
              disabled={isSubmitting || (recoveryMode === 'primary' && captcha.pending)}
              fullWidth
            >
              {isSubmitting
                ? t('security.sending')
                : recoveryMode === 'backup'
                  ? t('forgotPassword.sendRecoveryLink')
                  : t('forgotPassword.sendResetLink')}
            </Button>
          </form>
        )}

        <Button
          variant="link"
          onClick={() => setRecoveryMode((mode) => (mode === 'primary' ? 'backup' : 'primary'))}
        >
          {recoveryMode === 'primary'
            ? t('forgotPassword.useBackupEmail')
            : t('forgotPassword.usePrimaryEmail')}
        </Button>

        <p className="text-sm text-gray-500 dark:text-gray-400">
          <Link to="/login" className="text-blue-600 hover:underline">
            {t('auth.backToSignIn')}
          </Link>
        </p>
      </div>
    </main>
  );
}
