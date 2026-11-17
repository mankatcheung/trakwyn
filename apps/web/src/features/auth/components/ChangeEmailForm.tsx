import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Button, FormLabel, Input, SubmitButton } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { useFormAction } from '#/hooks/useFormAction';
import {
  REQUEST_EMAIL_CHANGE,
  extractGqlError,
} from '#/routes/_authenticated/settings/-components/shared';

const changeEmailSchema = z.object({
  newEmail: z.email('Enter a valid email address'),
  currentPassword: z.string().min(1, 'Enter your current password'),
});
type ChangeEmailValues = z.infer<typeof changeEmailSchema>;

/**
 * The "use a different address" form on the verification wall (JEF-438). A
 * direct call is right here: nothing cached changes, since the new address is
 * only confirmed from the link in its email.
 */
export function ChangeEmailForm({
  onSent,
  onCancel,
}: {
  /** Called with the address the confirmation link went to. */
  onSent: (email: string) => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const form = useForm<ChangeEmailValues>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { newEmail: '', currentPassword: '' },
  });
  const { errors } = form.formState;

  const { state, formProps } = useFormAction(form, async (data) => {
    try {
      await gqlClient.request(REQUEST_EMAIL_CHANGE, {
        currentPassword: data.currentPassword,
        newEmail: data.newEmail,
      });
    } catch (err) {
      return extractGqlError(err) ?? t('verifyRequired.changeEmailFailed');
    }
    onSent(data.newEmail);
    return null;
  });

  return (
    <form
      {...formProps}
      noValidate
      className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700"
    >
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t('verifyRequired.changeEmailIntro')}
      </p>
      {state.error && <Alert role="alert">{state.error}</Alert>}
      <div>
        <FormLabel htmlFor="verify-new-email">{t('security.newEmailLabel')}</FormLabel>
        <Input
          id="verify-new-email"
          type="email"
          placeholder="you@example.com"
          invalid={!!errors.newEmail}
          {...form.register('newEmail')}
        />
        {errors.newEmail && <p className="mt-1 text-xs text-red-600">{errors.newEmail.message}</p>}
      </div>
      <div>
        <FormLabel htmlFor="verify-current-password">
          {t('security.currentPasswordLabel')}
        </FormLabel>
        <Input
          id="verify-current-password"
          type="password"
          invalid={!!errors.currentPassword}
          {...form.register('currentPassword')}
        />
        {errors.currentPassword && (
          <p className="mt-1 text-xs text-red-600">{errors.currentPassword.message}</p>
        )}
      </div>
      <div className="flex gap-2">
        <SubmitButton>{t('verifyRequired.changeEmailSubmit')}</SubmitButton>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
