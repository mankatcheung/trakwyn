import { createFileRoute } from '@tanstack/react-router';
import { SettingsPlanPage } from './-components/SettingsPlanPage';

export const Route = createFileRoute('/_authenticated/settings/plan')({
  component: SettingsPlanPage,
});
