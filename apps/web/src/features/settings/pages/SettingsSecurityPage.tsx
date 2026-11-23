import { UnlinkIcon, CheckIcon, LogOutIcon, BanIcon } from 'lucide-react';
import { Alert, Button, Card, Skeleton } from '@trakwyn/ui';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { oauthErrorKey } from '#/features/auth/lib/oauthError';
import { API_ORIGIN } from '#/lib/apiOrigin';
import { OAuthProviderLogo } from '#/features/auth/components/OAuthProviderLogo';
import {
  LINKED_OAUTH_ACCOUNTS_QUERY,
  UNLINK_OAUTH_ACCOUNT,
  TOTP_ENABLED_QUERY,
  SESSIONS_QUERY,
  REVOKE_SESSION,
  REVOKE_OTHER_SESSIONS,
  SECURITY_ACTIVITY,
} from '../graphql/securityQueries';
import { extractGqlError } from '../lib/gqlErrors';
import {
  type TotpSetup,
  type LinkedOAuthAccount,
  type Session,
  type SecurityActivityItem,
  describeDevice,
} from '../lib/security/securityTypes';
import { useStepUpReauth } from '../hooks/useStepUpReauth';
import { PasswordUpdateForm } from '../components/security/PasswordUpdateForm';
import {
  TotpBeginForm,
  TotpConfirmForm,
  TotpDisableForm,
  RegenerateBackupCodesForm,
} from '../components/security/TwoFactorForms';

export function SettingsSecurityPage() {
  const { t } = useLocale();
  const qc = useQueryClient();
  const { withStepUp, dialog: stepUpDialog } = useStepUpReauth();

  // Linked OAuth accounts
  const { data: linkedAccountsData, isLoading: linkedAccountsLoading } = useQuery({
    queryKey: ['linkedOAuthAccounts'],
    queryFn: () =>
      gqlClient.request(LINKED_OAUTH_ACCOUNTS_QUERY) as Promise<{
        linkedOAuthAccounts: LinkedOAuthAccount[];
      }>,
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
    queryFn: () => gqlClient.request(TOTP_ENABLED_QUERY) as Promise<{ totpEnabled: boolean }>,
  });
  const totpEnabled = totpData?.totpEnabled ?? false;
  const [totpSetup, setTotpSetup] = useState<TotpSetup | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  // Active sessions
  const { data: sessionsData } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => gqlClient.request(SESSIONS_QUERY) as Promise<{ sessions: Session[] }>,
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
    (gqlClient.request(SECURITY_ACTIVITY) as Promise<{ securityActivity: SecurityActivityItem[] }>)
      .then((res) => setSecurityActivity(res.securityActivity))
      .catch((err) =>
        setSecurityActivityError(extractGqlError(err) ?? t('security.loadSecurityActivityFailed')),
      );
  }, [t]);

  // The new-sign-in-alert notification links here with #security-activity, so
  // the user lands on the login-event list itself rather than the top of this
  // long, single-scroll page. Plain browser anchor-scroll isn't reliable for
  // it — this is a client-rendered settings page, so the target may not exist
  // in the DOM yet when the browser processes the initial hash. Re-running on
  // every loading-state change (not just once on mount) matters too: the
  // sections above this one (linked accounts, 2FA, sessions) each load async
  // and grow the page after a first scroll would have already landed, which
  // left the target short of the top — scrollIntoView() is cheap enough to
  // just re-run as each one settles.
  useEffect(() => {
    if (window.location.hash !== '#security-activity') return;
    document.getElementById('security-activity')?.scrollIntoView();
  }, [linkedAccountsLoading, totpLoading, sessionsData, securityActivity]);

  return (
    <div className="space-y-8">
      {stepUpDialog}
      {/* ── Password ── */}
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-medium text-stone-900 dark:text-stone-100">
            {t('security.passwordTitle')}
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {t('security.passwordDescription')}
          </p>
        </div>
        <PasswordUpdateForm withStepUp={withStepUp} />
      </Card>

      {/* ── Linked accounts ── */}
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-medium text-stone-900 dark:text-stone-100">
            {t('security.linkedAccountsTitle')}
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
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
                  className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700"
                >
                  <div className="flex items-center gap-3">
                    <OAuthProviderLogo provider={provider} className="size-5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                        {providerLabel}
                      </p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {linked ? (linked.email ?? t('security.linked')) : t('security.notLinked')}
                      </p>
                    </div>
                  </div>
                  {linked ? (
                    <button
                      type="button"
                      onClick={() => onUnlink(provider)}
                      aria-label={t('security.unlinkAria', { provider: providerLabel })}
                      className="flex items-center gap-1 text-sm text-stone-500 hover:text-red-600 dark:text-stone-400 dark:hover:text-red-400"
                    >
                      <UnlinkIcon size={14} />{' '}
                      <span className="hidden sm:inline">{t('security.unlink')}</span>
                    </button>
                  ) : (
                    <a
                      href={`${API_ORIGIN}/auth/oauth/${provider}/start?mode=link`}
                      className="text-sm text-blue-800 dark:text-blue-400 hover:underline"
                    >
                      {t('security.link')}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Two-factor authentication ── */}
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-medium text-stone-900 dark:text-stone-100">
            {t('security.twoFactorTitle')}
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {t('security.twoFactorDescription')}
          </p>
        </div>

        {totpLoading ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : backupCodes ? (
          <div className="space-y-3">
            <p className="text-sm text-green-600">{t('security.twoFactorEnabled')}</p>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {t('security.backupCodesSaveNote')}
            </p>
            <ul className="grid grid-cols-2 gap-2 rounded-lg bg-stone-50 p-3 font-mono text-sm dark:bg-stone-800">
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
            <TotpDisableForm onDisabled={() => setBackupCodes(null)} />
            <RegenerateBackupCodesForm withStepUp={withStepUp} onRegenerated={setBackupCodes} />
          </>
        ) : totpSetup ? (
          <div className="space-y-3">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {t('security.scanQrCodeNote')}
            </p>
            <img
              src={totpSetup.qrCodeDataUrl}
              alt={t('security.qrCodeAlt')}
              className="size-40 rounded-lg border border-stone-200 dark:border-stone-700"
            />
            <p className="font-mono text-xs break-all text-stone-500 dark:text-stone-400">
              {totpSetup.secret}
            </p>
            <TotpConfirmForm
              onConfirmed={(codes) => {
                setTotpSetup(null);
                setBackupCodes(codes);
              }}
            />
          </div>
        ) : (
          <TotpBeginForm onBegun={setTotpSetup} />
        )}
      </Card>

      {/* ── Active sessions ── */}
      <Card className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-stone-900 dark:text-stone-100">
              {t('security.activeSessionsTitle')}
            </h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {t('security.activeSessionsDescription')}
            </p>
          </div>
          {sessions.length > 1 && (
            <button
              type="button"
              onClick={onRevokeOtherSessions}
              aria-label={t('security.signOutOtherSessions')}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-900 transition-colors hover:bg-stone-200 dark:bg-stone-700 dark:text-stone-100 dark:hover:bg-stone-600"
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
              className="flex items-center justify-between gap-4 rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-stone-900 dark:text-stone-100">
                  {session.deviceLabel ?? session.userAgent ?? t('security.unknownDevice')}
                  {session.current && (
                    <span className="ml-2 text-xs font-medium text-green-600">
                      {t('security.thisDevice')}
                    </span>
                  )}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400">
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
                  className="flex shrink-0 items-center gap-1 text-xs text-red-600 hover:underline"
                >
                  <BanIcon size={14} />{' '}
                  <span className="hidden sm:inline">{t('security.revoke')}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {/* ── Security activity ── */}
      <Card id="security-activity" className="scroll-mt-4 space-y-4 p-5">
        <div>
          <h2 className="text-base font-medium text-stone-900 dark:text-stone-100">
            {t('security.securityActivityTitle')}
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {t('security.securityActivityDescription')}
          </p>
        </div>
        {securityActivityError && <Alert>{securityActivityError}</Alert>}
        {!securityActivityError && securityActivity === null && (
          <p className="text-sm text-stone-500 dark:text-stone-400">{t('common.loading')}</p>
        )}
        {!securityActivityError && securityActivity?.length === 0 && (
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {t('security.noSecurityActivityYet')}
          </p>
        )}
        {!securityActivityError && securityActivity && securityActivity.length > 0 && (
          <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 dark:divide-stone-700 dark:border-stone-700">
            {securityActivity.map((event) => (
              <li key={event.id} className="px-3 py-2 text-sm">
                <p className="text-stone-900 dark:text-stone-100">
                  {t(`security.event.${event.eventType}`, { defaultValue: event.eventType })}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {t(`security.device.${describeDevice(event.userAgent)}`)}
                  {event.ipAddress ? ` · ${event.ipAddress}` : ''}
                  {' · '}
                  {new Date(event.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
