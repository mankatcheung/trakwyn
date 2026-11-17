import { createFileRoute } from '@tanstack/react-router';
import { SettingsNotificationsPage } from '../../../features/settings/pages/SettingsNotificationsPage';

export const Route = createFileRoute('/_authenticated/settings/notifications')({
  component: SettingsNotificationsPage,
});
