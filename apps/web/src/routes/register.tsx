import { createFileRoute, redirect } from '@tanstack/react-router';
import { hasSessionCookie } from '#/graphql/client';
import { RegisterPage } from '../features/auth/pages/RegisterPage';

export const Route = createFileRoute('/register')({
  // See routes/index.tsx for why this must be ssr: false.
  ssr: false,
  beforeLoad: () => {
    if (hasSessionCookie()) throw redirect({ to: '/dashboard' });
  },
  component: RegisterPage,
});
