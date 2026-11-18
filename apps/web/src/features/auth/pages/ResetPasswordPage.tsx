import { Link, useSearch } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { useState } from 'react';
import { useFormAction } from '#/hooks/useFormAction';
import { Alert, FormLabel, Input, SubmitButton } from '@trakwyn/ui';
import { RESET_PASSWORD_MUTATION } from '#/features/auth/graphql/authQueries';

const schema = z
  .object({
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
type FormValues = z.infer<typeof schema>;

function extractGqlError(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = (err as { response?: { errors?: Array<{ message?: string }> } }).response;
    return r?.errors?.[0]?.message ?? null;
  }
  return null;
}

export function ResetPasswordPage() {
  const { t } = useLocale();
  const { token } = useSearch({ from: '/reset-password' });
  const [done, setDone] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const {
    register,
    formState: { errors },
  } = form;

  const { state, formProps } = useFormAction(form, async (data) => {
    if (!token) return null;
    try {
      await gqlClient.request(RESET_PASSWORD_MUTATION, { token, newPassword: data.newPassword });
      setDone(true);
      return null;
    } catch (err: unknown) {
      return extractGqlError(err) ?? t('resetPassword.resetFailed');
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-white p-8 shadow-sm dark:bg-gray-800">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('resetPassword.title')}
          </h1>
        </div>

        {!token ? (
          <Alert>{t('resetPassword.invalidLink')}</Alert>
        ) : done ? (
          <Alert tone="success">{t('resetPassword.success')}</Alert>
        ) : (
          <form {...formProps} className="space-y-4">
            <div>
              <FormLabel>{t('security.newPasswordLabel')}</FormLabel>
              <Input
                type="password"
                {...register('newPassword')}
                invalid={!!errors.newPassword}
                placeholder="••••••••"
              />
              {errors.newPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.newPassword.message}</p>
              )}
            </div>

            <div>
              <FormLabel>{t('security.confirmNewPasswordLabel')}</FormLabel>
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

            {state.error && <Alert>{state.error}</Alert>}

            <SubmitButton pendingLabel={t('resetPassword.resetting')} fullWidth>
              {t('resetPassword.resetPassword')}
            </SubmitButton>
          </form>
        )}

        <p className="text-sm text-gray-500 dark:text-gray-400">
          <Link to="/login" className="text-blue-600 hover:underline">
            {t('auth.backToSignIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
