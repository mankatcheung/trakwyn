import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserIcon, Trash2Icon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { put as putBlob } from '@vercel/blob/client';
import { gqlClient } from '#/graphql/client';
import { Card, FormLabel, Skeleton } from '@trakwyn/ui';
import { useTheme, type Theme } from '#/lib/theme';
import { LOCALE_OPTIONS, useLocale } from '#/lib/i18n';
import { useStepUpReauth } from '../hooks/useStepUpReauth';
import { ProfileDetailsForm } from '../components/account/ProfileDetailsForm';
import { EmailChangeForm } from '../components/security/EmailChangeForm';
import { AddBackupEmailForm, RemoveBackupEmailForm } from '../components/security/BackupEmailForms';
import {
  ME_QUERY,
  REQUEST_AVATAR_UPLOAD_URL,
  CONFIRM_AVATAR,
  REMOVE_AVATAR,
  type Me,
  extractGqlError,
} from '../lib/shared';

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

  const { data: meData, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => gqlClient.request<{ me: Me | null }>(ME_QUERY),
  });
  const me = meData?.me;

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

  // An account made through Google or GitHub has no password to type; it
  // steps up instead when the API asks (JEF-463). Unknown while loading,
  // which shows the field, as before.
  const needsPassword = me?.hasPassword !== false;

  // Backup email recovery, read off the same ME_QUERY (JEF-204).
  const backupEmail = me?.backupEmail ?? null;
  const backupEmailVerified = Boolean(me?.backupEmailVerifiedAt);

  return (
    <div className="space-y-8">
      {/* ── Profile ── */}
      <Card className="space-y-4 p-5">
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
              className="size-16 rounded-full border border-gray-200 object-cover dark:border-gray-600"
            />
          ) : (
            <div className="flex size-16 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-500">
              <UserIcon size={28} />
            </div>
          )}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <label className="cursor-pointer px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400">
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
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-red-600 disabled:opacity-60 dark:text-gray-400 dark:hover:text-red-400"
                >
                  <Trash2Icon size={14} />{' '}
                  <span className="hidden sm:inline">{t('security.remove')}</span>
                </button>
              )}
            </div>
            {avatarError && <p className="text-xs text-red-600">{avatarError}</p>}
          </div>
        </div>

        {/* Keyed by the loaded account: the form is born with the saved values, since a
            react-hook-form reset after mount is cancelled by `useFormAction`. */}
        <ProfileDetailsForm key={me?.id ?? 'loading'} me={me} />
      </Card>

      {/* ── Email ── */}
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('security.emailTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('security.emailDescription')}
          </p>
        </div>
        <div>
          <FormLabel>{t('security.currentEmailLabel')}</FormLabel>
          {meLoading ? (
            <Skeleton className="h-5 w-48 rounded-sm" data-testid="current-email-loading" />
          ) : (
            <p className="text-sm text-gray-900 dark:text-gray-100">{me?.email}</p>
          )}
        </div>
        <EmailChangeForm needsPassword={needsPassword} withStepUp={withStepUp} />
      </Card>

      {/* ── Backup email ── */}
      <Card className="space-y-4 p-5">
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
            <RemoveBackupEmailForm needsPassword={needsPassword} withStepUp={withStepUp} />
          </div>
        ) : (
          <AddBackupEmailForm needsPassword={needsPassword} withStepUp={withStepUp} />
        )}
      </Card>

      {/* ── Appearance ── */}
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('profile.appearanceTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('profile.appearanceDescription')}
          </p>
        </div>
        <div className="inline-flex gap-1 rounded-lg border border-gray-300 p-1 dark:border-gray-600">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              aria-pressed={theme === option.value}
              aria-label={t('profile.themeAria', { theme: option.label })}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                theme === option.value
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
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
      </Card>
      {stepUpDialog}
    </div>
  );
}
