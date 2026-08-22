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
import { Checkbox, Select, Skeleton } from '@trakwyn/ui';

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
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('notifications.title')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('notifications.chooseEmails')}
          </p>
        </div>
        {prefsLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full max-w-xs rounded-lg" />
            <Skeleton className="h-5 w-48 rounded" />
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>
        ) : (
          prefs && (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="digest-frequency"
                  className="block text-sm font-medium text-gray-900 dark:text-gray-100"
                >
                  {t('notifications.digestLabel')}
                </label>
                <Select
                  id="digest-frequency"
                  value={digestFrequency}
                  onChange={(e) =>
                    onChangeDigestFrequency(
                      e.target.value as NotificationPreferences['digestFrequency'],
                    )
                  }
                  className="mt-1 max-w-xs"
                >
                  <option value="daily">{t('notifications.daily')}</option>
                  <option value="weekly">{t('notifications.weekly')}</option>
                  <option value="off">{t('notifications.off')}</option>
                </Select>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('notifications.digestHelp')}
                </p>
              </div>
              <label className="flex items-center gap-3 text-sm text-gray-900 dark:text-gray-100">
                <Checkbox
                  checked={prefs.followUpRemindersEnabled}
                  onChange={(e) => onToggleFollowUpReminders(e.target.checked)}
                />
                {t('notifications.followUpReminderEmails')}
              </label>
              <div>
                <label
                  htmlFor="weekly-application-goal"
                  className="block text-sm font-medium text-gray-900 dark:text-gray-100"
                >
                  {t('notifications.weeklyGoalLabel')}
                </label>
                <input
                  id="weekly-application-goal"
                  type="number"
                  min={1}
                  max={100}
                  value={prefs.weeklyApplicationGoal}
                  onChange={(e) => void onChangeWeeklyGoal(Number(e.target.value))}
                  className="mt-1 block w-28 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('notifications.weeklyGoalHelp')}
                </p>
              </div>
            </div>
          )
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('notifications.pushTitle')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('notifications.pushDescription')}
          </p>
        </div>
        {push.isSupported ? (
          <label className="flex items-center gap-3 text-sm text-gray-900 dark:text-gray-100">
            <Checkbox
              checked={push.isPermissionGranted}
              disabled={push.isBusy || push.isPermissionDenied}
              onChange={(e) => onTogglePushNotifications(e.target.checked)}
            />
            {push.isPermissionDenied
              ? t('notifications.pushBlocked')
              : push.isBusy
                ? t('notifications.settingUp')
                : t('notifications.pushLabel')}
          </label>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {t('notifications.pushUnsupported')}
          </p>
        )}
      </section>
    </div>
  );
}
