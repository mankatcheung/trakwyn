import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, FormLabel, Input, SubmitButton } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { useFormAction } from '#/hooks/useFormAction';
import { isStepUpCancelled, type WithStepUp } from '../../hooks/useStepUpReauth';
import { REQUEST_EMAIL_CHANGE } from '../../graphql/securityQueries';
import { extractGqlError } from '../../lib/gqlErrors';
import { emailSchema, type EmailForm } from '../../lib/security/securitySchemas';

/**
 * Asks for a new sign-in email. It only mails a confirmation link and changes
 * nothing a query shows, so it stays a direct call rather than a mutation.
 */
export function EmailChangeForm({
  needsPassword,
  withStepUp,
}: {
  needsPassword: boolean;
  withStepUp: WithStepUp;
}) {
  const { t } = useLocale();
  const [sent, setSent] = useState(false);
  const form = useForm<EmailForm>({ resolver: zodResolver(emailSchema) });
  const errors = form.formState.errors;

  const { state, formProps } = useFormAction(form, async (data, { resetFields }) => {
    setSent(false);
    if (needsPassword && !data.currentPassword) {
      form.setError('currentPassword', { message: 'Required' });
      return null;
    }
    try {
      await withStepUp(() =>
        gqlClient.request(REQUEST_EMAIL_CHANGE, {
          newEmail: data.newEmail,
          currentPassword: needsPassword ? data.currentPassword : null,
        }),
      );
      resetFields({ currentPassword: '', newEmail: '' });
      setSent(true);
      return null;
    } catch (err) {
      if (isStepUpCancelled(err)) return null;
      return extractGqlError(err) ?? t('security.emailUpdateFailed');
    }
  });

  return (
    <form {...formProps} className="space-y-3">
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
      <div>
        <FormLabel>{t('security.newEmailLabel')}</FormLabel>
        <Input
          type="email"
          {...form.register('newEmail')}
          invalid={!!errors.newEmail}
          placeholder="you@example.com"
        />
        {errors.newEmail && <p className="mt-1 text-xs text-red-600">{errors.newEmail.message}</p>}
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      {sent && !state.error && (
        <p className="text-sm text-green-700 dark:text-green-400">
          {t('security.emailConfirmationSent')}
        </p>
      )}
      <SubmitButton pendingLabel={t('security.sending')}>{t('security.updateEmail')}</SubmitButton>
    </form>
  );
}
