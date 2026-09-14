import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { SettingsIntegrationsPage } from './-components/SettingsIntegrationsPage';

const searchSchema = z.object({
  calendarConnected: z.string().optional(),
  calendarError: z.string().optional(),
});

export const Route = createFileRoute('/_authenticated/settings/integrations')({
  validateSearch: searchSchema,
  component: SettingsIntegrationsPage,
});
