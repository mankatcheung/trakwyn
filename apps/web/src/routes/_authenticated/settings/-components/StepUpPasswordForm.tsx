import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { Alert, Button, FormLabel, Input } from '@trakwyn/ui';
import {
  REAUTHENTICATE,
  reauthSchema,
  type ReauthForm,
  type ReauthenticateResult,
  extractGqlError,
} from './shared';

/** The password (and TOTP code, if 2FA is on) step-up for an account that has a password. */
export function StepUpPasswordForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const form = useForm<ReauthForm>({ resolver: zodResolver(reauthSchema) });
  const [totpRequired, setTotpRequired] = useState(false);

  const onSubmit = async (data: ReauthForm) => {
    try {
      const res = await gqlClient.request<{ reauthenticate: ReauthenticateResult }>(
        REAUTHENTICATE,
        { password: data.password, code: data.code || undefined },
      );
      if (res.reauthenticate.totpRequired) {
        setTotpRequired(true);
        return;
      }
      onSuccess();
    } catch (err) {
      form.setError('root', {
        message: extractGqlError(err) ?? t('stepUpReauth.verificationFailed'),
      });
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
      <div>
        <FormLabel>{t('auth.password')}</FormLabel>
        <Input
          type="password"
          {...form.register('password')}
          invalid={!!form.formState.errors.password}
          placeholder="••••••••"
          autoFocus
        />
        {form.formState.errors.password && (
          <p className="mt-1 text-xs text-red-600">{form.formState.errors.password.message}</p>
        )}
      </div>
      {totpRequired && (
        <div>
          <FormLabel>{t('stepUpReauth.twoFactorCodeLabel')}</FormLabel>
          <Input
            type="text"
            inputMode="numeric"
            {...form.register('code')}
            invalid={!!form.formState.errors.code}
            placeholder="123456"
            autoFocus
          />
          {form.formState.errors.code && (
            <p className="mt-1 text-xs text-red-600">{form.formState.errors.code.message}</p>
          )}
        </div>
      )}
      {form.formState.errors.root && <Alert>{form.formState.errors.root.message}</Alert>}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="link" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting
            ? t('auth.verifying')
            : totpRequired
              ? t('stepUpReauth.verifyCode')
              : t('security.confirm')}
        </Button>
      </div>
    </form>
  );
}
