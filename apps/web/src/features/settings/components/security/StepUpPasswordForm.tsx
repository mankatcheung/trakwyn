import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { useFormAction } from '#/hooks/useFormAction';
import { Alert, Button, FormLabel, Input, SubmitButton } from '@trakwyn/ui';
import {
  REAUTHENTICATE,
  reauthSchema,
  type ReauthForm,
  type ReauthenticateResult,
  extractGqlError,
} from '../../lib/shared';

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

  const { state, formProps } = useFormAction(form, async (data) => {
    try {
      const res = await gqlClient.request<{ reauthenticate: ReauthenticateResult }>(
        REAUTHENTICATE,
        { password: data.password, code: data.code || undefined },
      );
      if (res.reauthenticate.totpRequired) {
        setTotpRequired(true);
        return null;
      }
      onSuccess();
      return null;
    } catch (err) {
      return extractGqlError(err) ?? t('stepUpReauth.verificationFailed');
    }
  });

  return (
    <form {...formProps} className="space-y-3">
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
      {state.error && <Alert>{state.error}</Alert>}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="link" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <SubmitButton pendingLabel={t('auth.verifying')}>
          {totpRequired ? t('stepUpReauth.verifyCode') : t('security.confirm')}
        </SubmitButton>
      </div>
    </form>
  );
}
