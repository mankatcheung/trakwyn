import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, FormLabel, Input, SubmitButton } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { useFormAction } from '#/hooks/useFormAction';
import { isStepUpCancelled, type WithStepUp } from './useStepUpReauth';
import {
  BEGIN_TOTP_SETUP,
  CONFIRM_TOTP_SETUP,
  DISABLE_TOTP,
  REGENERATE_TOTP_BACKUP_CODES,
  totpBeginSchema,
  totpConfirmSchema,
  totpDisableSchema,
  extractGqlError,
  type TotpBeginForm,
  type TotpConfirmForm,
  type TotpDisableForm,
  type TotpSetup,
} from './shared';

/** Step 1 of enabling 2FA: the password gets a QR code and secret. Nothing is stored yet. */
export function TotpBeginForm({ onBegun }: { onBegun: (setup: TotpSetup) => void }) {
  const { t } = useLocale();
  const form = useForm<TotpBeginForm>({ resolver: zodResolver(totpBeginSchema) });
  const errors = form.formState.errors;

  const { state, formProps } = useFormAction(form, async (data, { resetFields }) => {
    try {
      const res = await gqlClient.request<{ beginTotpSetup: TotpSetup }>(BEGIN_TOTP_SETUP, data);
      resetFields({ password: '' });
      onBegun(res.beginTotpSetup);
      return null;
    } catch (err) {
      return extractGqlError(err) ?? t('security.startTwoFactorFailed');
    }
  });

  return (
    <form {...formProps} className="space-y-3">
      <div>
        <FormLabel>{t('security.confirmPasswordToEnableLabel')}</FormLabel>
        <Input
          type="password"
          {...form.register('password')}
          invalid={!!errors.password}
          placeholder="••••••••"
        />
        {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      <SubmitButton pendingLabel={t('security.starting')}>{t('security.enable2fa')}</SubmitButton>
    </form>
  );
}

/** Step 2: the code from the authenticator turns 2FA on and returns the backup codes. */
export function TotpConfirmForm({ onConfirmed }: { onConfirmed: (backupCodes: string[]) => void }) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const form = useForm<TotpConfirmForm>({ resolver: zodResolver(totpConfirmSchema) });
  const errors = form.formState.errors;

  const confirm = useMutation({
    mutationFn: (data: TotpConfirmForm) =>
      gqlClient.request<{ confirmTotpSetup: { backupCodes: string[] } }>(CONFIRM_TOTP_SETUP, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['totpEnabled'] }),
  });

  const { state, formProps } = useFormAction(form, async (data, { resetFields }) => {
    try {
      const res = await confirm.mutateAsync(data);
      resetFields({ code: '' });
      onConfirmed(res.confirmTotpSetup.backupCodes);
      return null;
    } catch (err) {
      return extractGqlError(err) ?? t('security.invalidCode');
    }
  });

  return (
    <form {...formProps} className="space-y-3">
      <div>
        <FormLabel>{t('security.enterCodeLabel')}</FormLabel>
        <Input
          type="text"
          inputMode="numeric"
          {...form.register('code')}
          invalid={!!errors.code}
          placeholder="123456"
        />
        {errors.code && <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>}
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      <SubmitButton pendingLabel={t('security.confirming')}>{t('security.confirm')}</SubmitButton>
    </form>
  );
}

/** Turns 2FA off, after the password. */
export function TotpDisableForm({ onDisabled }: { onDisabled: () => void }) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const form = useForm<TotpDisableForm>({ resolver: zodResolver(totpDisableSchema) });
  const errors = form.formState.errors;

  const disable = useMutation({
    mutationFn: (data: TotpDisableForm) => gqlClient.request(DISABLE_TOTP, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['totpEnabled'] }),
  });

  const { state, formProps } = useFormAction(form, async (data, { resetFields }) => {
    try {
      await disable.mutateAsync(data);
      resetFields({ password: '' });
      onDisabled();
      return null;
    } catch (err) {
      return extractGqlError(err) ?? t('security.disableTwoFactorFailed');
    }
  });

  return (
    <form {...formProps} className="space-y-3">
      <p className="text-sm text-green-600">{t('security.twoFactorEnabled')}</p>
      <div>
        <FormLabel>{t('security.confirmPasswordToDisableLabel')}</FormLabel>
        <Input
          type="password"
          {...form.register('password')}
          invalid={!!errors.password}
          placeholder="••••••••"
        />
        {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      <SubmitButton variant="destructive" pendingLabel={t('security.disabling')}>
        {t('security.disable2fa')}
      </SubmitButton>
    </form>
  );
}

/** Replaces the backup codes. They show once and are kept nowhere a query reads. */
export function RegenerateBackupCodesForm({
  withStepUp,
  onRegenerated,
}: {
  withStepUp: WithStepUp;
  onRegenerated: (backupCodes: string[]) => void;
}) {
  const { t } = useLocale();
  const form = useForm<TotpDisableForm>({ resolver: zodResolver(totpDisableSchema) });
  const errors = form.formState.errors;

  const { state, formProps } = useFormAction(form, async (data, { resetFields }) => {
    try {
      const result = await withStepUp(() =>
        gqlClient.request<{ regenerateTotpBackupCodes: { backupCodes: string[] } }>(
          REGENERATE_TOTP_BACKUP_CODES,
          { currentPassword: data.password },
        ),
      );
      resetFields({ password: '' });
      onRegenerated(result.regenerateTotpBackupCodes.backupCodes);
      return null;
    } catch (err) {
      if (isStepUpCancelled(err)) return null;
      return extractGqlError(err) ?? t('security.regenerateBackupCodesFailed');
    }
  });

  return (
    <form {...formProps} className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {t('security.regenerateBackupCodesTitle')}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {t('security.regenerateBackupCodesDescription')}
        </p>
      </div>
      <div>
        <FormLabel>{t('security.currentPasswordLabel')}</FormLabel>
        <Input
          type="password"
          {...form.register('password')}
          invalid={!!errors.password}
          placeholder="••••••••"
        />
        {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      <SubmitButton variant="secondary" pendingLabel={t('security.regenerating')}>
        {t('security.regenerateBackupCodes')}
      </SubmitButton>
    </form>
  );
}
