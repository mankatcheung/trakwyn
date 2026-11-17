import { createFileRoute } from '@tanstack/react-router';
import { SettingsDataPage } from '../../../features/settings/pages/SettingsDataPage';

export const Route = createFileRoute('/_authenticated/settings/data')({
  component: SettingsDataPage,
});
