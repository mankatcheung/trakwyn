import { createFileRoute } from '@tanstack/react-router';
import { SettingsLayout } from '../../../features/settings/pages/SettingsLayout';

export const Route = createFileRoute('/_authenticated/settings')({
  component: SettingsLayout,
});
