import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { SettingsSecurityPage } from '../../../features/settings/pages/SettingsSecurityPage';

const searchSchema = z.object({
  oauthLinked: z.string().optional(),
  oauthError: z.string().optional(),
});

export const Route = createFileRoute('/_authenticated/settings/security')({
  validateSearch: searchSchema,
  component: SettingsSecurityPage,
});
