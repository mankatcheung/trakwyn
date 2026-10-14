import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { gqlClient } from '#/graphql/client';
import { queryClient } from '#/lib/queryClient';
import { OAuthButtons } from '#/components/OAuthButtons';
import { LogoMark } from '#/components/LogoMark';
import { CaptchaWidget } from '#/components/CaptchaWidget';
import { useCaptcha } from '#/lib/useCaptcha';
import { useLocale } from '#/lib/i18n';
import { Alert, Button, FormLabel, Input } from '@trakwyn/ui';

const schema = z
  .object({
    email: z.string().email('Invalid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
type FormValues = z.infer<typeof schema>;

const REGISTER_MUTATION = `
  mutation Register($email: String!, $password: String!, $captchaToken: String) {
    register(email: $email, password: $password, captchaToken: $captchaToken)
  }
`;

export function RegisterPage() {
  const { t } = useLocale();
  const captcha = useCaptcha();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const onSubmit = async ({ email, password }: FormValues) => {
    try {
      await gqlClient.request<{ register: string }>(REGISTER_MUTATION, {
        email,
        password,
        captchaToken: captcha.token,
      });
      await queryClient.resetQueries();
      setRegisteredEmail(email);
    } catch (err: unknown) {
      // A captcha token works once, whatever the outcome of the request.
      captcha.reset();
      const msg = extractGqlError(err) ?? t('registerPage.registrationFailed');
      setError('root', { message: msg });
    }
  };

  if (registeredEmail) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
        <div className="w-full max-w-sm space-y-6">
          <Link to="/" className="flex items-center justify-center gap-2">
            <LogoMark size={28} />
            <span className="text-xl font-bold text-gray-900 dark:text-gray-100">Trakwyn</span>
          </Link>
          <div className="space-y-6 rounded-xl bg-white p-8 text-center shadow-sm dark:bg-gray-800">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <svg
                className="size-6 text-green-600 dark:text-green-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {t('auth.checkEmail')}
              </h1>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {t('auth.verificationSentPrefix')}{' '}
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {registeredEmail}
                </span>
                {t('auth.verificationSentSuffix')}
              </p>
            </div>
            <Link
              to="/login"
              className="inline-block w-full rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              {t('auth.backToSignIn')}
            </Link>
          </div>
        </div>
      </main>
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
              {t('auth.createAccount')}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('auth.alreadyHaveAccount')}{' '}
              <Link to="/login" className="text-blue-600 underline">
                {t('auth.signIn')}
              </Link>
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
              <FormLabel>{t('auth.password')}</FormLabel>
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

            <div>
              <FormLabel>{t('auth.confirmPassword')}</FormLabel>
              <Input
                type="password"
                {...register('confirmPassword')}
                invalid={!!errors.confirmPassword}
                placeholder="••••••••"
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>
              )}
            </div>

            <CaptchaWidget key={captcha.widgetKey} onToken={captcha.setToken} />

            {errors.root && <Alert>{errors.root.message}</Alert>}

            <Button type="submit" disabled={isSubmitting || captcha.pending} fullWidth>
              {isSubmitting ? t('auth.creatingAccount') : t('auth.createAccount')}
            </Button>
          </form>

          <OAuthButtons label={t('auth.signUp')} />

          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            {t('auth.termsAgreementPrefix')}{' '}
            <Link to="/terms" className="underline hover:text-gray-700 dark:hover:text-gray-200">
              {t('auth.termsOfService')}
            </Link>{' '}
            {t('auth.and')}{' '}
            <Link to="/privacy" className="underline hover:text-gray-700 dark:hover:text-gray-200">
              {t('auth.privacyPolicy')}
            </Link>
            {t('auth.termsAgreementSuffix')}
          </p>
        </div>
      </div>
    </main>
  );
}

function extractGqlError(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = (err as { response?: { errors?: Array<{ message?: string }> } }).response;
    return r?.errors?.[0]?.message ?? null;
  }
  return null;
}
