import { UnlinkIcon, CheckIcon, LogOutIcon, BanIcon } from 'lucide-react';
import { Alert, Button, FormLabel, Input, Skeleton } from '@trakwyn/ui';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { oauthErrorKey } from '#/lib/oauthError';
import { API_ORIGIN } from '#/lib/apiOrigin';
import { OAuthProviderLogo } from '#/components/OAuthProviderLogo';
import {
  UPDATE_PASSWORD,
  LINKED_OAUTH_ACCOUNTS_QUERY,
  UNLINK_OAUTH_ACCOUNT,
  TOTP_ENABLED_QUERY,
  BEGIN_TOTP_SETUP,
  CONFIRM_TOTP_SETUP,
  DISABLE_TOTP,
  REGENERATE_TOTP_BACKUP_CODES,
  SESSIONS_QUERY,
  REVOKE_SESSION,
  REVOKE_OTHER_SESSIONS,
  SECURITY_ACTIVITY,
  passwordSchema,
  totpBeginSchema,
  totpConfirmSchema,
  totpDisableSchema,
  type PasswordForm,
  type TotpBeginForm,
  type TotpConfirmForm,
  type TotpDisableForm,
  type TotpSetup,
  type LinkedOAuthAccount,
  type Session,
  type SecurityActivityItem,
  describeDevice,
  extractGqlError,
} from './shared';
import { useStepUpReauth, STEP_UP_CANCELLED } from './useStepUpReauth';

export function SettingsSecurityPage() {
  const { t } = useLocale();
  const qc = useQueryClient();
  const { withStepUp, dialog: stepUpDialog } = useStepUpReauth();

  // Password form
  const passwordForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });
  const onUpdatePassword = async ({ currentPassword, newPassword }: PasswordForm) => {
    try {
      await withStepUp(() => gqlClient.request(UPDATE_PASSWORD, { currentPassword, newPassword }));
      passwordForm.reset();
    } catch (err) {
      if (err instanceof Error && err.message === STEP_UP_CANCELLED) return;
      passwordForm.setError('root', {
        message: extractGqlError(err) ?? t('security.passwordUpdateFailed'),
      });
    }
  };

  // Linked OAuth accounts
  const { data: linkedAccountsData, isLoading: linkedAccountsLoading } = useQuery({
    queryKey: ['linkedOAuthAccounts'],
    queryFn: () =>
      gqlClient.request<{ linkedOAuthAccounts: LinkedOAuthAccount[] }>(LINKED_OAUTH_ACCOUNTS_QUERY),
  });
  const linkedAccounts = linkedAccountsData?.linkedOAuthAccounts ?? [];
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  // Feedback for a completed OAuth link attempt — the API redirects back
  // here with one of these after the provider callback (oauth.routes.ts).
  const { oauthLinked, oauthError: linkOauthError } = useSearch({
    from: '/_authenticated/settings/security',
  });
  const onUnlink = async (provider: LinkedOAuthAccount['provider']) => {
    setUnlinkError(null);
    try {
      await gqlClient.request(UNLINK_OAUTH_ACCOUNT, { provider });
      await qc.invalidateQueries({ queryKey: ['linkedOAuthAccounts'] });
    } catch (err) {
      setUnlinkError(extractGqlError(err) ?? t('security.unlinkFailed'));
    }
  };

  // Two-factor authentication
  const { data: totpData, isLoading: totpLoading } = useQuery({
    queryKey: ['totpEnabled'],
    queryFn: () => gqlClient.request<{ totpEnabled: boolean }>(TOTP_ENABLED_QUERY),
  });
  const totpEnabled = totpData?.totpEnabled ?? false;
  const [totpSetup, setTotpSetup] = useState<TotpSetup | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const totpBeginForm = useForm<TotpBeginForm>({ resolver: zodResolver(totpBeginSchema) });
  const onBeginTotpSetup = async (data: TotpBeginForm) => {
    try {
      const res = await gqlClient.request<{ beginTotpSetup: TotpSetup }>(BEGIN_TOTP_SETUP, data);
      setTotpSetup(res.beginTotpSetup);
      totpBeginForm.reset();
    } catch (err) {
      totpBeginForm.setError('root', {
        message: extractGqlError(err) ?? t('security.startTwoFactorFailed'),
      });
    }
  };

  const totpConfirmForm = useForm<TotpConfirmForm>({ resolver: zodResolver(totpConfirmSchema) });
  const onConfirmTotpSetup = async (data: TotpConfirmForm) => {
    try {
      const res = await gqlClient.request<{ confirmTotpSetup: { backupCodes: string[] } }>(
        CONFIRM_TOTP_SETUP,
        data,
      );
      setTotpSetup(null);
      setBackupCodes(res.confirmTotpSetup.backupCodes);
      totpConfirmForm.reset();
      await qc.invalidateQueries({ queryKey: ['totpEnabled'] });
    } catch (err) {
      totpConfirmForm.setError('root', {
        message: extractGqlError(err) ?? t('security.invalidCode'),
      });
    }
  };

  const totpDisableForm = useForm<TotpDisableForm>({ resolver: zodResolver(totpDisableSchema) });
  const regenerateBackupCodesForm = useForm<TotpDisableForm>({
    resolver: zodResolver(totpDisableSchema),
  });
  const onDisableTotp = async (data: TotpDisableForm) => {
    try {
      await gqlClient.request(DISABLE_TOTP, data);
      totpDisableForm.reset();
      setBackupCodes(null);
      await qc.invalidateQueries({ queryKey: ['totpEnabled'] });
    } catch (err) {
      totpDisableForm.setError('root', {
        message: extractGqlError(err) ?? t('security.disableTwoFactorFailed'),
      });
    }
  };

  const onRegenerateBackupCodes = async (data: TotpDisableForm) => {
    try {
      const result = await withStepUp(() =>
        gqlClient.request<{ regenerateTotpBackupCodes: { backupCodes: string[] } }>(
          REGENERATE_TOTP_BACKUP_CODES,
          { currentPassword: data.password },
        ),
      );
      setBackupCodes(result.regenerateTotpBackupCodes.backupCodes);
      regenerateBackupCodesForm.reset();
    } catch (err) {
      if (err instanceof Error && err.message === STEP_UP_CANCELLED) return;
      regenerateBackupCodesForm.setError('root', {
        message: extractGqlError(err) ?? t('security.regenerateBackupCodesFailed'),
      });
    }
  };

  // Active sessions
  const { data: sessionsData } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => gqlClient.request<{ sessions: Session[] }>(SESSIONS_QUERY),
  });
  const sessions = sessionsData?.sessions ?? [];

  const onRevokeSession = async (id: string) => {
    await gqlClient.request(REVOKE_SESSION, { id });
    await qc.invalidateQueries({ queryKey: ['sessions'] });
  };

  const onRevokeOtherSessions = async () => {
    await gqlClient.request(REVOKE_OTHER_SESSIONS);
    await qc.invalidateQueries({ queryKey: ['sessions'] });
  };

  // Security activity (logins, password/email changes, 2FA toggles, session revocations)
  const [securityActivity, setSecurityActivity] = useState<SecurityActivityItem[] | null>(null);
  const [securityActivityError, setSecurityActivityError] = useState<string | null>(null);
  useEffect(() => {
    gqlClient
      .request<{ securityActivity: SecurityActivityItem[] }>(SECURITY_ACTIVITY)
      .then((res) => setSecurityActivity(res.securityActivity))
      .catch((err) =>
        setSecurityActivityError(extractGqlError(err) ?? t('security.loadSecurityActivityFailed')),
      );
  }, [t]);

  return (
    <div className="space-y-10">
      {stepUpDialog}
      {/* ── Password ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('security.passwordTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('security.passwordDescription')}
          </p>
        </div>
        <form onSubmit={passwordForm.handleSubmit(onUpdatePassword)} className="space-y-3">
          <div>
            <FormLabel>{t('security.currentPasswordLabel')}</FormLabel>
            <Input
              type="password"
              {...passwordForm.register('currentPassword')}
              invalid={!!passwordForm.formState.errors.currentPassword}
              placeholder="••••••••"
            />
            {passwordForm.formState.errors.currentPassword && (
              <p className="mt-1 text-xs text-red-600">
                {passwordForm.formState.errors.currentPassword.message}
              </p>
            )}
          </div>
          <div>
            <FormLabel>{t('security.newPasswordLabel')}</FormLabel>
            <Input
              type="password"
              {...passwordForm.register('newPassword')}
              invalid={!!passwordForm.formState.errors.newPassword}
              placeholder="••••••••"
            />
            {passwordForm.formState.errors.newPassword && (
              <p className="mt-1 text-xs text-red-600">
                {passwordForm.formState.errors.newPassword.message}
              </p>
            )}
          </div>
          <div>
            <FormLabel>{t('security.confirmNewPasswordLabel')}</FormLabel>
            <Input
              type="password"
              {...passwordForm.register('confirmPassword')}
              invalid={!!passwordForm.formState.errors.confirmPassword}
              placeholder="••••••••"
            />
            {passwordForm.formState.errors.confirmPassword && (
              <p className="mt-1 text-xs text-red-600">
                {passwordForm.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>
          {passwordForm.formState.errors.root && (
            <Alert>{passwordForm.formState.errors.root.message}</Alert>
          )}
          {passwordForm.formState.isSubmitSuccessful && !passwordForm.formState.errors.root && (
            <p className="text-sm text-green-600">{t('security.passwordUpdated')}</p>
          )}
          <Button type="submit" disabled={passwordForm.formState.isSubmitting}>
            {passwordForm.formState.isSubmitting
              ? t('applicationForm.saving')
              : t('security.updatePassword')}
          </Button>
        </form>
      </section>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* ── Linked accounts ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('security.linkedAccountsTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('security.linkedAccountsDescription')}
          </p>
        </div>
        {unlinkError && <Alert>{unlinkError}</Alert>}
        {oauthLinked && (
          <Alert tone="success">
            {t('security.linkSucceeded', { provider: t(`security.${oauthLinked}`) })}
          </Alert>
        )}
        {linkOauthError && <Alert>{t(oauthErrorKey(linkOauthError))}</Alert>}
        {linkedAccountsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
          </div>
        ) : (
          <div className="space-y-2">
            {(['google', 'github'] as const).map((provider) => {
              const linked = linkedAccounts.find((a) => a.provider === provider);
              const providerLabel = t(`security.${provider}`);
              return (
                <div
                  key={provider}
                  className="flex items-center justify-between px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <OAuthProviderLogo provider={provider} className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {providerLabel}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {linked ? (linked.email ?? t('security.linked')) : t('security.notLinked')}
                      </p>
                    </div>
                  </div>
                  {linked ? (
                    <button
                      type="button"
                      onClick={() => onUnlink(provider)}
                      aria-label={t('security.unlinkAria', { provider: providerLabel })}
                      className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                    >
                      <UnlinkIcon size={14} />{' '}
                      <span className="hidden sm:inline">{t('security.unlink')}</span>
                    </button>
                  ) : (
                    <a
                      href={`${API_ORIGIN}/auth/oauth/${provider}/start?mode=link`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {t('security.link')}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* ── Two-factor authentication ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('security.twoFactorTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('security.twoFactorDescription')}
          </p>
        </div>

        {totpLoading ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : backupCodes ? (
          <div className="space-y-3">
            <p className="text-sm text-green-600">{t('security.twoFactorEnabled')}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('security.backupCodesSaveNote')}
            </p>
            <ul className="grid grid-cols-2 gap-2 font-mono text-sm bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              {backupCodes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
            <Button
              onClick={() => setBackupCodes(null)}
              aria-label={t('security.savedCodesConfirm')}
            >
              <span className="flex items-center gap-1.5">
                <CheckIcon size={14} />{' '}
                <span className="hidden sm:inline">{t('security.savedCodesConfirm')}</span>
              </span>
            </Button>
          </div>
        ) : totpEnabled ? (
          <>
            <form onSubmit={totpDisableForm.handleSubmit(onDisableTotp)} className="space-y-3">
              <p className="text-sm text-green-600">{t('security.twoFactorEnabled')}</p>
              <div>
                <FormLabel>{t('security.confirmPasswordToDisableLabel')}</FormLabel>
                <Input
                  type="password"
                  {...totpDisableForm.register('password')}
                  invalid={!!totpDisableForm.formState.errors.password}
                  placeholder="••••••••"
                />
                {totpDisableForm.formState.errors.password && (
                  <p className="mt-1 text-xs text-red-600">
                    {totpDisableForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              {totpDisableForm.formState.errors.root && (
                <Alert>{totpDisableForm.formState.errors.root.message}</Alert>
              )}
              <Button
                type="submit"
                variant="destructive"
                disabled={totpDisableForm.formState.isSubmitting}
              >
                {totpDisableForm.formState.isSubmitting
                  ? t('security.disabling')
                  : t('security.disable2fa')}
              </Button>
            </form>
            <form
              onSubmit={regenerateBackupCodesForm.handleSubmit(onRegenerateBackupCodes)}
              className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700"
            >
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
                  {...regenerateBackupCodesForm.register('password')}
                  invalid={!!regenerateBackupCodesForm.formState.errors.password}
                  placeholder="••••••••"
                />
                {regenerateBackupCodesForm.formState.errors.password && (
                  <p className="mt-1 text-xs text-red-600">
                    {regenerateBackupCodesForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              {regenerateBackupCodesForm.formState.errors.root && (
                <Alert>{regenerateBackupCodesForm.formState.errors.root.message}</Alert>
              )}
              <button
                type="submit"
                disabled={regenerateBackupCodesForm.formState.isSubmitting}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-gray-900 text-sm font-medium rounded-lg transition-colors dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100"
              >
                {regenerateBackupCodesForm.formState.isSubmitting
                  ? t('security.regenerating')
                  : t('security.regenerateBackupCodes')}
              </button>
            </form>
          </>
        ) : totpSetup ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('security.scanQrCodeNote')}
            </p>
            <img
              src={totpSetup.qrCodeDataUrl}
              alt={t('security.qrCodeAlt')}
              className="w-40 h-40 rounded-lg border border-gray-200 dark:border-gray-700"
            />
            <p className="text-xs font-mono text-gray-500 dark:text-gray-400 break-all">
              {totpSetup.secret}
            </p>
            <form onSubmit={totpConfirmForm.handleSubmit(onConfirmTotpSetup)} className="space-y-3">
              <div>
                <FormLabel>{t('security.enterCodeLabel')}</FormLabel>
                <Input
                  type="text"
                  inputMode="numeric"
                  {...totpConfirmForm.register('code')}
                  invalid={!!totpConfirmForm.formState.errors.code}
                  placeholder="123456"
                />
                {totpConfirmForm.formState.errors.code && (
                  <p className="mt-1 text-xs text-red-600">
                    {totpConfirmForm.formState.errors.code.message}
                  </p>
                )}
              </div>
              {totpConfirmForm.formState.errors.root && (
                <Alert>{totpConfirmForm.formState.errors.root.message}</Alert>
              )}
              <Button type="submit" disabled={totpConfirmForm.formState.isSubmitting}>
                {totpConfirmForm.formState.isSubmitting
                  ? t('security.confirming')
                  : t('security.confirm')}
              </Button>
            </form>
          </div>
        ) : (
          <form onSubmit={totpBeginForm.handleSubmit(onBeginTotpSetup)} className="space-y-3">
            <div>
              <FormLabel>{t('security.confirmPasswordToEnableLabel')}</FormLabel>
              <Input
                type="password"
                {...totpBeginForm.register('password')}
                invalid={!!totpBeginForm.formState.errors.password}
                placeholder="••••••••"
              />
              {totpBeginForm.formState.errors.password && (
                <p className="mt-1 text-xs text-red-600">
                  {totpBeginForm.formState.errors.password.message}
                </p>
              )}
            </div>
            {totpBeginForm.formState.errors.root && (
              <Alert>{totpBeginForm.formState.errors.root.message}</Alert>
            )}
            <Button type="submit" disabled={totpBeginForm.formState.isSubmitting}>
              {totpBeginForm.formState.isSubmitting
                ? t('security.starting')
                : t('security.enable2fa')}
            </Button>
          </form>
        )}
      </section>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* ── Active sessions ── */}
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t('security.activeSessionsTitle')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('security.activeSessionsDescription')}
            </p>
          </div>
          {sessions.length > 1 && (
            <button
              type="button"
              onClick={onRevokeOtherSessions}
              aria-label={t('security.signOutOtherSessions')}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 text-xs font-medium rounded-lg transition-colors"
            >
              <LogOutIcon size={14} />{' '}
              <span className="hidden sm:inline">{t('security.signOutOtherSessions')}</span>
            </button>
          )}
        </div>
        <ul className="space-y-2">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex items-center justify-between gap-4 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div className="min-w-0">
                <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                  {session.deviceLabel ?? session.userAgent ?? t('security.unknownDevice')}
                  {session.current && (
                    <span className="ml-2 text-xs text-green-600 font-medium">
                      {t('security.thisDevice')}
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {session.location ? `${session.location} · ` : ''}
                  {session.ipAddress ?? t('security.unknownIp')} · {t('security.lastActive')}{' '}
                  {new Date(session.lastUsedAt).toLocaleString()}
                </p>
              </div>
              {!session.current && (
                <button
                  type="button"
                  onClick={() => onRevokeSession(session.id)}
                  aria-label={t('security.revokeSessionAria')}
                  className="shrink-0 flex items-center gap-1 text-xs text-red-600 hover:underline"
                >
                  <BanIcon size={14} />{' '}
                  <span className="hidden sm:inline">{t('security.revoke')}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* ── Security activity ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('security.securityActivityTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('security.securityActivityDescription')}
          </p>
        </div>
        {securityActivityError && <Alert>{securityActivityError}</Alert>}
        {!securityActivityError && securityActivity === null && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
        )}
        {!securityActivityError && securityActivity?.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('security.noSecurityActivityYet')}
          </p>
        )}
        {!securityActivityError && securityActivity && securityActivity.length > 0 && (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700">
            {securityActivity.map((event) => (
              <li key={event.id} className="px-3 py-2 text-sm">
                <p className="text-gray-900 dark:text-gray-100">
                  {t(`security.event.${event.eventType}`, { defaultValue: event.eventType })}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t(`security.device.${describeDevice(event.userAgent)}`)}
                  {event.ipAddress ? ` · ${event.ipAddress}` : ''}
                  {' · '}
                  {new Date(event.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
