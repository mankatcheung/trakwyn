import { createFileRoute } from '@tanstack/react-router';
import { SettingsIntegrationsPage } from '../../../features/settings/pages/SettingsIntegrationsPage';

export const Route = createFileRoute('/_authenticated/settings/integrations')({
  component: SettingsIntegrationsPage,
});
