import { createFileRoute } from '@tanstack/react-router';
import { SettingsAiPage } from '../../../features/settings/pages/SettingsAiPage';

export const Route = createFileRoute('/_authenticated/settings/ai')({
  component: SettingsAiPage,
});
