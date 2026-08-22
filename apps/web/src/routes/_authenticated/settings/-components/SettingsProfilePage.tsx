import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserIcon, Trash2Icon } from 'lucide-react';
import { put as putBlob } from '@vercel/blob/client';
import { gqlClient } from '#/graphql/client';
import { Alert, Button, FormLabel, Input, Skeleton } from '@trakwyn/ui';
import { useTheme, type Theme } from '#/lib/theme';
import { LOCALE_OPTIONS, useLocale } from '#/lib/i18n';
import { useStepUpReauth, STEP_UP_CANCELLED } from './useStepUpReauth';
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import {
  ME_QUERY,
  REQUEST_EMAIL_CHANGE,
  REQUEST_ADD_BACKUP_EMAIL,
  REMOVE_BACKUP_EMAIL,
  emailSchema,
  backupEmailSchema,
  removeBackupEmailSchema,
  type EmailForm,
  type BackupEmailForm,
  type RemoveBackupEmailForm,
  REQUEST_AVATAR_UPLOAD_URL,
  CONFIRM_AVATAR,
  REMOVE_AVATAR,
  UPDATE_PROFILE,
  profileSchema,
  type ProfileForm,
  type Me,
  extractGqlError,
} from './shared';

export function SettingsProfilePage() {
  const qc = useQueryClient();
  const { withStepUp, dialog: stepUpDialog } = useStepUpReauth();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useLocale();
  const THEME_OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: t('profile.themeLight'), icon: <SunIcon size={16} /> },
    { value: 'dark', label: t('profile.themeDark'), icon: <MoonIcon size={16} /> },
    { value: 'system', label: t('profile.themeSystem'), icon: <MonitorIcon size={16} /> },
  ];

  const timezoneOptions = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return [];
    }
  }, []);

  // Profile form
  const { data: meData, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => gqlClient.request<{ me: Me | null }>(ME_QUERY),
  });
  const me = meData?.me;
  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: {
      name: me?.name ?? '',
      timezone: me?.timezone ?? '',
      targetRole: me?.targetRole ?? '',
    },
  });
  const onUpdateProfile = async (data: ProfileForm) => {
    try {
      await gqlClient.request(UPDATE_PROFILE, {
        name: data.name.trim() || null,
        timezone: data.timezone.trim() || null,
        targetRole: data.targetRole.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      profileForm.setError('root', {
        message: extractGqlError(err) ?? t('profile.updateProfileFailed'),
      });
    }
  };

  // Avatar
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const onAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const { requestAvatarUploadUrl } = await gqlClient.request<{
        requestAvatarUploadUrl: { uploadUrl: string; storageKey: string };
      }>(REQUEST_AVATAR_UPLOAD_URL, { filename: file.name, mimeType: file.type });

      await putBlob(requestAvatarUploadUrl.storageKey, file, {
        access: 'public',
        token: requestAvatarUploadUrl.uploadUrl,
        contentType: file.type,
      });

      await gqlClient.request(CONFIRM_AVATAR, {
        storageKey: requestAvatarUploadUrl.storageKey,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      await qc.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      setAvatarError(extractGqlError(err) ?? t('profile.uploadPhotoFailed'));
    } finally {
      setAvatarUploading(false);
    }
  };

  const onRemoveAvatar = async () => {
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      await gqlClient.request(REMOVE_AVATAR);
      await qc.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      setAvatarError(extractGqlError(err) ?? t('profile.removePhotoFailed'));
    } finally {
      setAvatarUploading(false);
    }
  };

  // Email form
  const emailForm = useForm<EmailForm>({ resolver: zodResolver(emailSchema) });
  const onUpdateEmail = async (data: EmailForm) => {
    try {
      await withStepUp(() => gqlClient.request(REQUEST_EMAIL_CHANGE, data));
      emailForm.reset();
      emailForm.setError('root', { message: '' });
    } catch (err) {
      if (err instanceof Error && err.message === STEP_UP_CANCELLED) return;
      emailForm.setError('root', {
        message: extractGqlError(err) ?? t('security.emailUpdateFailed'),
      });
    }
  };

  // Backup email recovery. Read off the page's existing ME_QUERY, which
  // already selects both fields — the moved block brought its own narrower
  // `SecurityMe` query, now redundant (JEF-204).
  const backupEmail = me?.backupEmail ?? null;
  const backupEmailVerified = Boolean(me?.backupEmailVerifiedAt);
  const backupEmailForm = useForm<BackupEmailForm>({ resolver: zodResolver(backupEmailSchema) });
  const removeBackupEmailForm = useForm<RemoveBackupEmailForm>({
    resolver: zodResolver(removeBackupEmailSchema),
  });
  const onAddBackupEmail = async (data: BackupEmailForm) => {
    try {
      await withStepUp(() => gqlClient.request(REQUEST_ADD_BACKUP_EMAIL, data));
      backupEmailForm.reset();
      await qc.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      if (err instanceof Error && err.message === STEP_UP_CANCELLED) return;
      backupEmailForm.setError('root', {
        message: extractGqlError(err) ?? t('security.addBackupEmailFailed'),
      });
    }
  };
  const onRemoveBackupEmail = async (data: RemoveBackupEmailForm) => {
    try {
      await withStepUp(() => gqlClient.request(REMOVE_BACKUP_EMAIL, data));
      removeBackupEmailForm.reset();
      await qc.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      if (err instanceof Error && err.message === STEP_UP_CANCELLED) return;
      removeBackupEmailForm.setError('root', {
        message: extractGqlError(err) ?? t('security.removeBackupEmailFailed'),
      });
    }
  };

  return (
    <div className="space-y-10">
      {/* ── Profile ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('profile.profileTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('profile.profileDescription')}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {me?.avatarUrl ? (
            <img
              src={me.avatarUrl}
              alt={t('profile.profilePhotoAlt')}
              className="w-16 h-16 rounded-full object-cover border border-gray-200 dark:border-gray-600"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600">
              <UserIcon size={28} />
            </div>
          )}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <label className="cursor-pointer px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline">
                {avatarUploading
                  ? t('documents.uploading')
                  : me?.avatarUrl
                    ? t('profile.changePhoto')
                    : t('profile.uploadPhoto')}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={onAvatarFileChange}
                  disabled={avatarUploading}
                />
              </label>
              {me?.avatarUrl && (
                <button
                  type="button"
                  onClick={onRemoveAvatar}
                  disabled={avatarUploading}
                  aria-label={t('profile.removePhotoAria')}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 disabled:opacity-60"
                >
                  <Trash2Icon size={14} />{' '}
                  <span className="hidden sm:inline">{t('security.remove')}</span>
                </button>
              )}
            </div>
            {avatarError && <p className="text-xs text-red-600">{avatarError}</p>}
          </div>
        </div>

        <form onSubmit={profileForm.handleSubmit(onUpdateProfile)} className="space-y-3">
          <div>
            <FormLabel>{t('profile.nameLabel')}</FormLabel>
            <Input
              type="text"
              {...profileForm.register('name')}
              invalid={!!profileForm.formState.errors.name}
              placeholder="Jane Doe"
            />
            {profileForm.formState.errors.name && (
              <p className="mt-1 text-xs text-red-600">
                {profileForm.formState.errors.name.message}
              </p>
            )}
          </div>
          <div>
            <FormLabel>{t('profile.timezoneLabel')}</FormLabel>
            <Input
              type="text"
              list="timezone-options"
              {...profileForm.register('timezone')}
              invalid={!!profileForm.formState.errors.timezone}
              placeholder="America/Los_Angeles"
            />
            <datalist id="timezone-options">
              {timezoneOptions.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
            {profileForm.formState.errors.timezone && (
              <p className="mt-1 text-xs text-red-600">
                {profileForm.formState.errors.timezone.message}
              </p>
            )}
          </div>
          <div>
            <FormLabel>{t('profile.targetRoleLabel')}</FormLabel>
            <Input
              type="text"
              {...profileForm.register('targetRole')}
              invalid={!!profileForm.formState.errors.targetRole}
              placeholder="Senior Product Designer"
            />
            {profileForm.formState.errors.targetRole && (
              <p className="mt-1 text-xs text-red-600">
                {profileForm.formState.errors.targetRole.message}
              </p>
            )}
          </div>
          {profileForm.formState.errors.root?.message && (
            <Alert>{profileForm.formState.errors.root.message}</Alert>
          )}
          {profileForm.formState.isSubmitSuccessful &&
            !profileForm.formState.errors.root?.message && (
              <p className="text-sm text-green-600">{t('profile.profileUpdated')}</p>
            )}
          <Button type="submit" disabled={profileForm.formState.isSubmitting}>
            {profileForm.formState.isSubmitting
              ? t('applicationForm.saving')
              : t('profile.saveProfile')}
          </Button>
        </form>
      </section>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* ── Email ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('security.emailTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('security.emailDescription')}
          </p>
        </div>
        <form onSubmit={emailForm.handleSubmit(onUpdateEmail)} className="space-y-3">
          <div>
            <FormLabel>{t('security.currentPasswordLabel')}</FormLabel>
            <Input
              type="password"
              {...emailForm.register('currentPassword')}
              invalid={!!emailForm.formState.errors.currentPassword}
              placeholder="••••••••"
            />
            {emailForm.formState.errors.currentPassword && (
              <p className="mt-1 text-xs text-red-600">
                {emailForm.formState.errors.currentPassword.message}
              </p>
            )}
          </div>
          <div>
            <FormLabel>{t('security.newEmailLabel')}</FormLabel>
            <Input
              type="email"
              {...emailForm.register('newEmail')}
              invalid={!!emailForm.formState.errors.newEmail}
              placeholder="you@example.com"
            />
            {emailForm.formState.errors.newEmail && (
              <p className="mt-1 text-xs text-red-600">
                {emailForm.formState.errors.newEmail.message}
              </p>
            )}
          </div>
          {emailForm.formState.errors.root?.message && (
            <Alert>{emailForm.formState.errors.root.message}</Alert>
          )}
          {emailForm.formState.isSubmitSuccessful && !emailForm.formState.errors.root?.message && (
            <p className="text-sm text-green-600">{t('security.emailConfirmationSent')}</p>
          )}
          <Button type="submit" disabled={emailForm.formState.isSubmitting}>
            {emailForm.formState.isSubmitting ? t('security.sending') : t('security.updateEmail')}
          </Button>
        </form>
      </section>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* ── Backup email ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('security.backupEmailTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('security.backupEmailDescription')}
          </p>
        </div>
        {meLoading ? (
          <Skeleton className="h-10 rounded-lg" />
        ) : backupEmail ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {backupEmail}{' '}
              <span className={backupEmailVerified ? 'text-green-600' : 'text-amber-600'}>
                {backupEmailVerified ? t('security.verified') : t('security.verificationPending')}
              </span>
            </p>
            <form
              onSubmit={removeBackupEmailForm.handleSubmit(onRemoveBackupEmail)}
              className="space-y-3"
            >
              <div>
                <FormLabel>{t('security.currentPasswordToRemoveLabel')}</FormLabel>
                <Input
                  type="password"
                  {...removeBackupEmailForm.register('currentPassword')}
                  invalid={!!removeBackupEmailForm.formState.errors.currentPassword}
                  placeholder="••••••••"
                />
                {removeBackupEmailForm.formState.errors.currentPassword && (
                  <p className="mt-1 text-xs text-red-600">
                    {removeBackupEmailForm.formState.errors.currentPassword.message}
                  </p>
                )}
              </div>
              {removeBackupEmailForm.formState.errors.root?.message && (
                <Alert>{removeBackupEmailForm.formState.errors.root.message}</Alert>
              )}
              <Button
                type="submit"
                variant="destructive"
                disabled={removeBackupEmailForm.formState.isSubmitting}
              >
                {removeBackupEmailForm.formState.isSubmitting
                  ? t('security.removing')
                  : t('security.removeBackupEmail')}
              </Button>
            </form>
          </div>
        ) : (
          <form onSubmit={backupEmailForm.handleSubmit(onAddBackupEmail)} className="space-y-3">
            <div>
              <FormLabel>{t('security.backupEmailLabel')}</FormLabel>
              <Input
                type="email"
                {...backupEmailForm.register('backupEmail')}
                invalid={!!backupEmailForm.formState.errors.backupEmail}
                placeholder="backup@example.com"
              />
              {backupEmailForm.formState.errors.backupEmail && (
                <p className="mt-1 text-xs text-red-600">
                  {backupEmailForm.formState.errors.backupEmail.message}
                </p>
              )}
            </div>
            <div>
              <FormLabel>{t('security.currentPasswordLabel')}</FormLabel>
              <Input
                type="password"
                {...backupEmailForm.register('currentPassword')}
                invalid={!!backupEmailForm.formState.errors.currentPassword}
                placeholder="••••••••"
              />
              {backupEmailForm.formState.errors.currentPassword && (
                <p className="mt-1 text-xs text-red-600">
                  {backupEmailForm.formState.errors.currentPassword.message}
                </p>
              )}
            </div>
            {backupEmailForm.formState.errors.root?.message && (
              <Alert>{backupEmailForm.formState.errors.root.message}</Alert>
            )}
            {backupEmailForm.formState.isSubmitSuccessful && (
              <p className="text-sm text-green-600">{t('security.backupEmailVerificationSent')}</p>
            )}
            <Button type="submit" disabled={backupEmailForm.formState.isSubmitting}>
              {backupEmailForm.formState.isSubmitting
                ? t('security.sending')
                : t('security.addBackupEmail')}
            </Button>
          </form>
        )}
      </section>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* ── Appearance ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('profile.appearanceTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('profile.appearanceDescription')}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 p-1 gap-1">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              aria-pressed={theme === option.value}
              aria-label={t('profile.themeAria', { theme: option.label })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                theme === option.value
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {option.icon}
              <span className="hidden sm:inline">{option.label}</span>
            </button>
          ))}
        </div>

        <div className="max-w-md space-y-2">
          <label
            htmlFor="language"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t('settings.language')}
          </label>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('settings.languageDescription')}
          </p>
          <select
            id="language"
            value={locale}
            onChange={(event) => setLocale(event.target.value as typeof locale)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          >
            {LOCALE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>
      {stepUpDialog}
    </div>
  );
}
