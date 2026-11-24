import { useQuery } from '@tanstack/react-query';
import { Card, FormLabel, Skeleton } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import type { WithStepUp } from '../../hooks/useStepUpReauth';
import { ME_QUERY } from '../../graphql/accountQueries';
import type { Me } from '../../lib/account/accountTypes';
import { EmailChangeForm } from './EmailChangeForm';
import { AddBackupEmailForm, RemoveBackupEmailForm } from './BackupEmailForms';

/**
 * The sign-in email and the backup (recovery) email. They ask for the current
 * password like the other account-security forms, so they sit on the Security
 * page rather than Profile (JEF-686).
 */
export function AccountEmailSections({ withStepUp }: { withStepUp: WithStepUp }) {
  const { t } = useLocale();
  const { data: meData, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => gqlClient.request(ME_QUERY) as Promise<{ me: Me | null }>,
  });
  const me = meData?.me;

  // An account made through Google or GitHub has no password to type; it
  // steps up instead when the API asks (JEF-463). Unknown while loading,
  // which shows the field, as before.
  const needsPassword = me?.hasPassword !== false;

  // Backup email recovery, read off the same ME_QUERY (JEF-204).
  const backupEmail = me?.backupEmail ?? null;
  const backupEmailVerified = Boolean(me?.backupEmailVerifiedAt);

  return (
    <>
      {/* ── Email ── */}
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-medium text-stone-900 dark:text-stone-100">
            {t('security.emailTitle')}
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {t('security.emailDescription')}
          </p>
        </div>
        <div>
          <FormLabel>{t('security.currentEmailLabel')}</FormLabel>
          {meLoading ? (
            <Skeleton className="h-5 w-48 rounded-sm" data-testid="current-email-loading" />
          ) : (
            <p className="text-sm text-stone-900 dark:text-stone-100">{me?.email}</p>
          )}
        </div>
        <EmailChangeForm needsPassword={needsPassword} withStepUp={withStepUp} />
      </Card>

      {/* ── Backup email ── */}
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-medium text-stone-900 dark:text-stone-100">
            {t('security.backupEmailTitle')}
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {t('security.backupEmailDescription')}
          </p>
        </div>
        {meLoading ? (
          <Skeleton className="h-10 rounded-lg" />
        ) : backupEmail ? (
          <div className="space-y-3">
            <p className="text-sm text-stone-900 dark:text-stone-100">
              {backupEmail}{' '}
              <span
                className={
                  backupEmailVerified
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-amber-700 dark:text-amber-400'
                }
              >
                {backupEmailVerified ? t('security.verified') : t('security.verificationPending')}
              </span>
            </p>
            <RemoveBackupEmailForm needsPassword={needsPassword} withStepUp={withStepUp} />
          </div>
        ) : (
          <AddBackupEmailForm needsPassword={needsPassword} withStepUp={withStepUp} />
        )}
      </Card>
    </>
  );
}
