import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ProfilePage } from '../../../features/profile/pages/ProfilePage';

const searchSchema = z.object({
  /**
   * Where to go back to once the profile is filled in, e.g. the cover-letter
   * form that sent the user here (JEF-460). Checked again with
   * `sameOriginPath` before it is used, so an off-site value shows no link.
   */
  returnTo: z.string().optional(),
});

export const Route = createFileRoute('/_authenticated/profile/')({
  validateSearch: searchSchema,
  component: ProfilePage,
});
