import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, FormLabel, Input, SubmitButton } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { useFormAction } from '#/hooks/useFormAction';
import { isStepUpCancelled, type WithStepUp } from '../../hooks/useStepUpReauth';
import {
  UPDATE_PASSWORD,
  passwordSchema,
  extractGqlError,
  type PasswordForm,
} from '../../lib/shared';

/** Changes the password. Nothing a query shows changes, so it stays a direct call. */
export function PasswordUpdateForm({ withStepUp }: { withStepUp: WithStepUp }) {
  const { t } = useLocale();
  const [updated, setUpdated] = useState(false);
  const form = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });
  const errors = form.formState.errors;

  const { state, formProps } = useFormAction(
    form,
    async ({ currentPassword, newPassword }, { resetFields }) => {
      setUpdated(false);
      try {
        await withStepUp(() =>
          gqlClient.request(UPDATE_PASSWORD, { currentPassword, newPassword }),
        );
        resetFields({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setUpdated(true);
        return null;
      } catch (err) {
        if (isStepUpCancelled(err)) return null;
        return extractGqlError(err) ?? t('security.passwordUpdateFailed');
      }
    },
  );

  return (
    <form {...formProps} className="space-y-3">
      <div>
        <FormLabel>{t('security.currentPasswordLabel')}</FormLabel>
        <Input
          type="password"
          {...form.register('currentPassword')}
          invalid={!!errors.currentPassword}
          placeholder="••••••••"
        />
        {errors.currentPassword && (
          <p className="mt-1 text-xs text-red-600">{errors.currentPassword.message}</p>
        )}
      </div>
      <div>
        <FormLabel>{t('security.newPasswordLabel')}</FormLabel>
        <Input
          type="password"
          {...form.register('newPassword')}
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
          {...form.register('confirmPassword')}
          invalid={!!errors.confirmPassword}
          placeholder="••••••••"
        />
        {errors.confirmPassword && (
          <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>
        )}
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      {updated && !state.error && (
        <p className="text-sm text-green-600">{t('security.passwordUpdated')}</p>
      )}
      <SubmitButton pendingLabel={t('applicationForm.saving')}>
        {t('security.updatePassword')}
      </SubmitButton>
    </form>
  );
}
