import { createFileRoute } from '@tanstack/react-router';
import { SettingsPlanPage } from '../../../features/settings/pages/SettingsPlanPage';

export const Route = createFileRoute('/_authenticated/settings/plan')({
  component: SettingsPlanPage,
});
