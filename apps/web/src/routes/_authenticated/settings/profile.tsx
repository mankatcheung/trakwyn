import { createFileRoute } from '@tanstack/react-router';
import { SettingsProfilePage } from '../../../features/settings/pages/SettingsProfilePage';

export const Route = createFileRoute('/_authenticated/settings/profile')({
  component: SettingsProfilePage,
});
