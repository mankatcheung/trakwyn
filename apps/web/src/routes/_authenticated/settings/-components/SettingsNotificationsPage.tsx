import { useQuery, useQueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { toast } from 'sonner';
import {
  NOTIFICATION_PREFERENCES_QUERY,
  UPDATE_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from './shared';
import { usePushNotifications } from '#/hooks/usePushNotifications';
import { useLocale } from '#/lib/i18n';
import { QuotaHint } from '#/components/QuotaHint';
import { Card, Checkbox, Select, Skeleton } from '@trakwyn/ui';

export function SettingsNotificationsPage() {
  const { t } = useLocale();
  const qc = useQueryClient();
  const push = usePushNotifications();

  const { data: prefsData, isLoading: prefsLoading } = useQuery({
    queryKey: ['notificationPreferences'],
    queryFn: () =>
      gqlClient.request<{ notificationPreferences: NotificationPreferences }>(
        NOTIFICATION_PREFERENCES_QUERY,
      ),
  });
  const prefs = prefsData?.notificationPreferences;
  const digestFrequency = prefs?.digestFrequency ?? (prefs?.weeklyDigestEnabled ? 'weekly' : 'off');

  const onChangeDigestFrequency = async (
    digestFrequency: NotificationPreferences['digestFrequency'],
  ) => {
    await gqlClient.request(UPDATE_NOTIFICATION_PREFERENCES, { digestFrequency });
    await qc.invalidateQueries({ queryKey: ['notificationPreferences'] });
  };

  const onToggleFollowUpReminders = async (checked: boolean) => {
    await gqlClient.request(UPDATE_NOTIFICATION_PREFERENCES, {
      followUpRemindersEnabled: checked,
    });
    await qc.invalidateQueries({ queryKey: ['notificationPreferences'] });
  };

  const onTogglePushNotifications = async (checked: boolean) => {
    if (checked) {
      const success = await push.enable();
      if (!success) {
        toast.error(
          push.isPermissionDenied
            ? t('notifications.permissionDeniedToast')
            : t('notifications.enableFailedToast'),
        );
        return;
      }
      toast.success(t('notifications.enabledToast'));
    } else {
      await push.disable();
      toast.success(t('notifications.disabledToast'));
    }
    await gqlClient.request(UPDATE_NOTIFICATION_PREFERENCES, {
      pushNotificationsEnabled: checked,
    });
    await qc.invalidateQueries({ queryKey: ['notificationPreferences'] });
  };

  const onChangeWeeklyGoal = async (goal: number) => {
    if (!Number.isInteger(goal) || goal < 1 || goal > 100) return;
    await gqlClient.request(UPDATE_NOTIFICATION_PREFERENCES, { weeklyApplicationGoal: goal });
    await qc.invalidateQueries({ queryKey: ['notificationPreferences'] });
  };

  return (
    <div className="space-y-8">
      <Card className="p-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('notifications.title')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('notifications.chooseEmails')}
        </p>
        {prefsLoading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-10 w-full max-w-xs rounded-lg" />
            <Skeleton className="h-5 w-48 rounded-sm" />
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>
        ) : (
          prefs && (
            <div className="mt-4 divide-y divide-gray-100 dark:divide-gray-700">
              <div className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div>
                  <label
                    htmlFor="digest-frequency"
                    className="block text-sm font-medium text-gray-900 dark:text-gray-100"
                  >
                    {t('notifications.digestLabel')}
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('notifications.digestHelp')}
                  </p>
                </div>
                <Select
                  id="digest-frequency"
                  value={digestFrequency}
                  onChange={(e) =>
                    onChangeDigestFrequency(
                      e.target.value as NotificationPreferences['digestFrequency'],
                    )
                  }
                  className="shrink-0 sm:w-40"
                >
                  <option value="daily">{t('notifications.daily')}</option>
                  <option value="weekly">{t('notifications.weekly')}</option>
                  <option value="off">{t('notifications.off')}</option>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-6 py-3">
                <label
                  htmlFor="follow-up-reminders"
                  className="text-sm font-medium text-gray-900 dark:text-gray-100"
                >
                  {t('notifications.followUpReminderEmails')}
                </label>
                <Checkbox
                  id="follow-up-reminders"
                  checked={prefs.followUpRemindersEnabled}
                  onChange={(e) => onToggleFollowUpReminders(e.target.checked)}
                />
              </div>
              <div className="flex flex-col gap-2 py-3 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div>
                  <label
                    htmlFor="weekly-application-goal"
                    className="block text-sm font-medium text-gray-900 dark:text-gray-100"
                  >
                    {t('notifications.weeklyGoalLabel')}
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('notifications.weeklyGoalHelp')}
                  </p>
                </div>
                <input
                  id="weekly-application-goal"
                  type="number"
                  min={1}
                  max={100}
                  value={prefs.weeklyApplicationGoal}
                  onChange={(e) => void onChangeWeeklyGoal(Number(e.target.value))}
                  className="block w-28 shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
            </div>
          )
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('notifications.pushTitle')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('notifications.pushDescription')}
        </p>
        <QuotaHint resource="pushSubscriptions" className="mt-1" />
        {push.error && (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {push.error}
          </p>
        )}
        {push.isSupported ? (
          <div className="mt-4 flex items-center justify-between gap-6">
            <label
              htmlFor="push-notifications"
              className="text-sm font-medium text-gray-900 dark:text-gray-100"
            >
              {push.isPermissionDenied
                ? t('notifications.pushBlocked')
                : push.isBusy
                  ? t('notifications.settingUp')
                  : t('notifications.pushLabel')}
            </label>
            <Checkbox
              id="push-notifications"
              checked={push.isPermissionGranted}
              disabled={push.isBusy || push.isPermissionDenied}
              onChange={(e) => onTogglePushNotifications(e.target.checked)}
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-400 dark:text-gray-500">
            {t('notifications.pushUnsupported')}
          </p>
        )}
      </Card>
    </div>
  );
}
