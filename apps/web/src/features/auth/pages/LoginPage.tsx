import { useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { gqlClient } from '#/graphql/client';
import { queryClient } from '#/lib/queryClient';
import { OAuthButtons } from '#/features/auth/components/OAuthButtons';
import { AuthDivider } from '#/features/auth/components/AuthDivider';
import { ERROR_CODES } from '#/constants';
import { getErrorMessage } from '#/lib/errors';
import { getGqlErrorCode } from '#/lib/graphqlError';
import { CaptchaWidget } from '#/features/auth/components/CaptchaWidget';
import { useCaptcha } from '#/features/auth/hooks/useCaptcha';
import { LogoMark } from '#/components/LogoMark';
import { LegalFooterLinks } from '#/features/legal/components/LegalFooterLinks';
import { useLocale } from '#/lib/i18n';
import { oauthErrorKey } from '#/features/auth/lib/oauthError';
import { safeReturnTo } from '#/lib/returnTo';
import { useFormAction } from '#/hooks/useFormAction';
import { Alert, Button, FormLabel, Input, SubmitButton } from '@trakwyn/ui';
import { LOGIN_MUTATION, LOGIN_WITH_TOTP_MUTATION } from '#/features/auth/graphql/authQueries';

const schema = z.object({
  email: z.email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
export type FormValues = z.infer<typeof schema>;

const totpSchema = z.object({
  code: z
    .string()
    .min(6, 'Enter your 6-digit code or a backup code')
    .max(20, 'Enter your 6-digit code or a backup code'),
});
type TotpFormValues = z.infer<typeof totpSchema>;

export function LoginPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { oauthError, returnTo } = useSearch({ strict: false }) as {
    oauthError?: string;
    returnTo?: string;
  };
  const destination = safeReturnTo(returnTo);
  const [pendingCredentials, setPendingCredentials] = useState<FormValues | null>(null);
  const [captchaNeeded, setCaptchaNeeded] = useState(false);
  const captcha = useCaptcha();

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const {
    register,
    formState: { errors },
  } = form;

  const { state, formProps } = useFormAction(form, async (data) => {
    try {
      const res = await gqlClient.request<{
        login: { success: boolean; totpRequired: boolean; accessToken: string | null };
      }>(LOGIN_MUTATION, { ...data, captchaToken: captcha.token });
      if (res.login.totpRequired) {
        setPendingCredentials(data);
        return null;
      }
      await queryClient.resetQueries();
      await navigate({ to: destination as '/dashboard' });
      return null;
    } catch (err: unknown) {
      // A captcha token works once, whatever the outcome of the request.
      if (captchaNeeded) captcha.reset();
      const code = getGqlErrorCode(err);
      if (code === ERROR_CODES.CAPTCHA_REQUIRED || code === ERROR_CODES.CAPTCHA_FAILED) {
        // The API asks for a captcha only after repeated failures, so the
        // widget appears now rather than on every sign-in.
        setCaptchaNeeded(true);
        return t(
          code === ERROR_CODES.CAPTCHA_REQUIRED ? 'auth.captchaRequired' : 'auth.captchaFailed',
        );
      }
      return getErrorMessage(err);
    }
  });

  if (pendingCredentials) {
    return (
      <TotpStep
        credentials={pendingCredentials}
        destination={destination}
        onBack={() => setPendingCredentials(null)}
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-sm space-y-6">
        <Link to="/" className="flex items-center justify-center gap-2">
          <LogoMark size={28} />
          <span className="text-xl font-bold text-gray-900 dark:text-gray-100">Trakwyn</span>
        </Link>
        <div className="space-y-6 rounded-xl bg-white p-8 shadow-sm dark:bg-gray-800">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {t('auth.signIn')}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('auth.noAccount')}{' '}
              <Link to="/register" className="text-blue-600 underline">
                {t('auth.register')}
              </Link>
            </p>
          </div>

          {oauthError && <Alert>{t(oauthErrorKey(oauthError))}</Alert>}

          <OAuthButtons label={t('auth.signIn')} returnTo={returnTo} />

          <AuthDivider label={t('auth.orSignInWithEmail')} />

          <form {...formProps} className="space-y-4">
            <div>
              <FormLabel>{t('auth.email')}</FormLabel>
              <Input
                type="email"
                {...register('email')}
                invalid={!!errors.email}
                placeholder="you@example.com"
              />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('auth.password')}
                </label>
                <Link to="/forgot-password" className="text-xs text-blue-600 hover:underline">
                  {t('auth.forgotPassword')}
                </Link>
              </div>
              <Input
                type="password"
                {...register('password')}
                invalid={!!errors.password}
                placeholder="••••••••"
              />
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>

            {state.error && (
              <Alert>
                {state.error.includes('register') ? (
                  <>
                    {t('auth.noAccountFound')}{' '}
                    <Link to="/register" className="font-medium underline hover:text-red-700">
                      {t('auth.register')}
                    </Link>{' '}
                    {t('auth.createOne')}
                  </>
                ) : (
                  state.error
                )}
              </Alert>
            )}

            {captchaNeeded && <CaptchaWidget key={captcha.widgetKey} onToken={captcha.setToken} />}

            <SubmitButton
              disabled={captchaNeeded && captcha.pending}
              pendingLabel={t('auth.signingIn')}
              fullWidth
            >
              {t('auth.signIn')}
            </SubmitButton>
          </form>
        </div>
        <LegalFooterLinks />
      </div>
    </main>
  );
}

function TotpStep({
  credentials,
  destination,
  onBack,
}: {
  credentials: FormValues;
  destination: string;
  onBack: () => void;
}) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const form = useForm<TotpFormValues>({ resolver: zodResolver(totpSchema) });
  const {
    register,
    formState: { errors },
  } = form;

  const { state, formProps } = useFormAction(form, async (data) => {
    try {
      await gqlClient.request<{ loginWithTotp: string }>(LOGIN_WITH_TOTP_MUTATION, {
        ...credentials,
        code: data.code,
      });
      await queryClient.resetQueries();
      await navigate({ to: destination as '/dashboard' });
      return null;
    } catch (err: unknown) {
      return getErrorMessage(err);
    }
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2">
          <LogoMark size={28} />
          <span className="text-xl font-bold text-gray-900 dark:text-gray-100">Trakwyn</span>
        </div>
        <div className="space-y-6 rounded-xl bg-white p-8 shadow-sm dark:bg-gray-800">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {t('auth.twoFactor')}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('auth.twoFactorHelp')}
            </p>
          </div>

          <form {...formProps} className="space-y-4">
            <div>
              <FormLabel>{t('auth.code')}</FormLabel>
              <Input
                type="text"
                autoFocus
                {...register('code')}
                invalid={!!errors.code}
                placeholder="123456"
              />
              {errors.code && <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>}
            </div>

            {state.error && <Alert>{state.error}</Alert>}

            <SubmitButton pendingLabel={t('auth.verifying')} fullWidth>
              {t('auth.verify')}
            </SubmitButton>
          </form>

          <Button variant="link" size="sm" onClick={onBack}>
            {t('auth.backToSignIn')}
          </Button>
        </div>
      </div>
    </main>
  );
}
