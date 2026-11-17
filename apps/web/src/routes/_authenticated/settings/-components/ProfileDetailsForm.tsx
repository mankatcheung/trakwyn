import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, FormLabel, Input, SubmitButton, Textarea } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { useFormAction } from '#/hooks/useFormAction';
import {
  UPDATE_PROFILE,
  parseProfileLinks,
  profileSchema,
  extractGqlError,
  type Me,
  type ProfileForm,
} from './shared';

/** Name, timezone, target role and contact details. Saves through `updateProfile`. */
export function ProfileDetailsForm({ me }: { me: Me | null | undefined }) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const timezoneOptions = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return [];
    }
  }, []);

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: {
      name: me?.name ?? '',
      timezone: me?.timezone ?? '',
      targetRole: me?.targetRole ?? '',
      phone: me?.phone ?? '',
      location: me?.location ?? '',
      profileLinks: (me?.profileLinks ?? []).join('\n'),
    },
  });
  const errors = form.formState.errors;
  // Schema messages that are i18n keys are translated; the rest are shown as written.
  const fieldError = (message: string | undefined) =>
    message?.startsWith('profile.') ? t(message as Parameters<typeof t>[0]) : message;

  const update = useMutation({
    mutationFn: (data: ProfileForm) =>
      gqlClient.request(UPDATE_PROFILE, {
        name: data.name.trim() || null,
        timezone: data.timezone.trim() || null,
        targetRole: data.targetRole.trim() || null,
        phone: data.phone.trim() || null,
        location: data.location.trim() || null,
        profileLinks: parseProfileLinks(data.profileLinks),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  const { state, formProps } = useFormAction(form, async (data) => {
    setSaved(false);
    try {
      await update.mutateAsync(data);
      setSaved(true);
      return null;
    } catch (err) {
      return extractGqlError(err) ?? t('profile.updateProfileFailed');
    }
  });

  return (
    <form {...formProps} className="space-y-3">
      <div>
        <FormLabel>{t('profile.nameLabel')}</FormLabel>
        <Input
          type="text"
          {...form.register('name')}
          invalid={!!errors.name}
          placeholder="Jane Doe"
        />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>
      <div>
        <FormLabel>{t('profile.timezoneLabel')}</FormLabel>
        <Input
          type="text"
          list="timezone-options"
          {...form.register('timezone')}
          invalid={!!errors.timezone}
          placeholder="America/Los_Angeles"
        />
        <datalist id="timezone-options">
          {timezoneOptions.map((tz) => (
            <option key={tz} value={tz} />
          ))}
        </datalist>
        {errors.timezone && <p className="mt-1 text-xs text-red-600">{errors.timezone.message}</p>}
      </div>
      <div>
        <FormLabel>{t('profile.targetRoleLabel')}</FormLabel>
        <Input
          type="text"
          {...form.register('targetRole')}
          invalid={!!errors.targetRole}
          placeholder="Senior Product Designer"
        />
        {errors.targetRole && (
          <p className="mt-1 text-xs text-red-600">{errors.targetRole.message}</p>
        )}
      </div>
      <div>
        <FormLabel>{t('profile.phoneLabel')}</FormLabel>
        <Input
          type="tel"
          autoComplete="tel"
          {...form.register('phone')}
          invalid={!!errors.phone}
          placeholder="+44 20 7946 0958"
        />
        {errors.phone && (
          <p className="mt-1 text-xs text-red-600">{fieldError(errors.phone.message)}</p>
        )}
      </div>
      <div>
        <FormLabel>{t('profile.locationLabel')}</FormLabel>
        <Input
          type="text"
          autoComplete="address-level2"
          {...form.register('location')}
          invalid={!!errors.location}
          placeholder="London, UK"
        />
        {errors.location && <p className="mt-1 text-xs text-red-600">{errors.location.message}</p>}
      </div>
      <div>
        <FormLabel>{t('profile.profileLinksLabel')}</FormLabel>
        <Textarea
          rows={3}
          {...form.register('profileLinks')}
          invalid={!!errors.profileLinks}
          placeholder={'https://www.linkedin.com/in/jane-doe\nhttps://janedoe.dev'}
          aria-describedby="profile-links-hint"
        />
        <p id="profile-links-hint" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {t('profile.profileLinksHint')}
        </p>
        {errors.profileLinks && (
          <p className="mt-1 text-xs text-red-600">{fieldError(errors.profileLinks.message)}</p>
        )}
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      {saved && !state.error && (
        <p className="text-sm text-green-600">{t('profile.profileUpdated')}</p>
      )}
      <SubmitButton pendingLabel={t('applicationForm.saving')}>
        {t('profile.saveProfile')}
      </SubmitButton>
    </form>
  );
}
