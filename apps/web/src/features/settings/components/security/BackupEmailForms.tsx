import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, FormLabel, Input, SubmitButton } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { useFormAction } from '#/hooks/useFormAction';
import { isStepUpCancelled, type WithStepUp } from '../../hooks/useStepUpReauth';
import { REQUEST_ADD_BACKUP_EMAIL, REMOVE_BACKUP_EMAIL } from '../../graphql/securityQueries';
import { extractGqlError } from '../../lib/gqlErrors';
import {
  backupEmailSchema,
  removeBackupEmailSchema,
  type BackupEmailForm,
  type RemoveBackupEmailForm,
} from '../../lib/security/securitySchemas';

interface BackupEmailFormProps {
  needsPassword: boolean;
  withStepUp: WithStepUp;
}

/** Adds a backup email. The pending address shows on `me`, so this is a mutation. */
export function AddBackupEmailForm({ needsPassword, withStepUp }: BackupEmailFormProps) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [sent, setSent] = useState(false);
  const form = useForm<BackupEmailForm>({ resolver: zodResolver(backupEmailSchema) });
  const errors = form.formState.errors;

  const add = useMutation({
    mutationFn: (vars: { backupEmail: string; currentPassword: string | null | undefined }) =>
      withStepUp(() => gqlClient.request(REQUEST_ADD_BACKUP_EMAIL, vars)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  const { state, formProps } = useFormAction(form, async (data, { resetFields }) => {
    setSent(false);
    if (needsPassword && !data.currentPassword) {
      form.setError('currentPassword', { message: 'Required' });
      return null;
    }
    try {
      await add.mutateAsync({
        backupEmail: data.backupEmail,
        currentPassword: needsPassword ? data.currentPassword : null,
      });
      resetFields({ backupEmail: '', currentPassword: '' });
      setSent(true);
      return null;
    } catch (err) {
      if (isStepUpCancelled(err)) return null;
      return extractGqlError(err) ?? t('security.addBackupEmailFailed');
    }
  });

  return (
    <form {...formProps} className="space-y-3">
      <div>
        <FormLabel>{t('security.backupEmailLabel')}</FormLabel>
        <Input
          type="email"
          {...form.register('backupEmail')}
          invalid={!!errors.backupEmail}
          placeholder="backup@example.com"
        />
        {errors.backupEmail && (
          <p className="mt-1 text-xs text-red-600">{errors.backupEmail.message}</p>
        )}
      </div>
      {needsPassword && (
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
      )}
      {state.error && <Alert>{state.error}</Alert>}
      {sent && !state.error && (
        <p className="text-sm text-green-700 dark:text-green-400">
          {t('security.backupEmailVerificationSent')}
        </p>
      )}
      <SubmitButton pendingLabel={t('security.sending')}>
        {t('security.addBackupEmail')}
      </SubmitButton>
    </form>
  );
}

/** Removes the backup email. */
export function RemoveBackupEmailForm({ needsPassword, withStepUp }: BackupEmailFormProps) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const form = useForm<RemoveBackupEmailForm>({ resolver: zodResolver(removeBackupEmailSchema) });
  const errors = form.formState.errors;

  const remove = useMutation({
    mutationFn: (vars: { currentPassword: string | null | undefined }) =>
      withStepUp(() => gqlClient.request(REMOVE_BACKUP_EMAIL, vars)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  const { state, formProps } = useFormAction(form, async (data, { resetFields }) => {
    if (needsPassword && !data.currentPassword) {
      form.setError('currentPassword', { message: 'Required' });
      return null;
    }
    try {
      await remove.mutateAsync({ currentPassword: needsPassword ? data.currentPassword : null });
      resetFields({ currentPassword: '' });
      return null;
    } catch (err) {
      if (isStepUpCancelled(err)) return null;
      return extractGqlError(err) ?? t('security.removeBackupEmailFailed');
    }
  });

  return (
    <form {...formProps} className="space-y-3">
      {needsPassword && (
        <div>
          <FormLabel>{t('security.currentPasswordToRemoveLabel')}</FormLabel>
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
      )}
      {state.error && <Alert>{state.error}</Alert>}
      <SubmitButton variant="destructive" pendingLabel={t('security.removing')}>
        {t('security.removeBackupEmail')}
      </SubmitButton>
    </form>
  );
}
