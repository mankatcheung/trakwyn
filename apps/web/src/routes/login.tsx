import { createFileRoute, redirect } from '@tanstack/react-router';
import { hasSessionCookie } from '#/graphql/client';
import { safeReturnTo } from '#/features/auth/lib/returnTo';
import { z } from 'zod';
import { LoginPage } from '../features/auth/pages/LoginPage';

const searchSchema = z.object({
  oauthError: z.string().optional(),
  returnTo: z.string().optional(),
});

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  // See routes/index.tsx for why this must be ssr: false.
  ssr: false,
  beforeLoad: ({ search }) => {
    if (hasSessionCookie()) {
      // Already signed in — skip the form and deliver whatever the returnTo
      // parameter promised (defaulting to the dashboard), not the login page
      // itself (JEF-233).
      throw redirect({ to: safeReturnTo(search.returnTo) as '/dashboard' });
    }
  },
  component: LoginPage,
});
