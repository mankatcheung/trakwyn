import { useEffect } from 'react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { hasSessionCookie } from '#/graphql/client';
import { checkEmailVerification, useEmailVerification } from '#/lib/emailVerification';
import { VerifyEmailRequiredPage } from './-components/VerifyEmailRequiredPage';

/**
 * The full-page reminder for a signed-in user whose email is not verified
 * (JEF-438). `/_authenticated/*` sends them here before any of its loaders
 * run, since the API would refuse every one. Verified users, and anyone whose
 * check could not be made, are sent on to the app.
 */
function VerifyEmailRequiredRoute() {
  const navigate = useNavigate();
  const { data } = useEmailVerification();
  const verified = data?.emailVerified === true;

  // Verified in another tab or app and came back: the focus refetch lands here.
  useEffect(() => {
    if (verified) void navigate({ to: '/dashboard' });
  }, [verified, navigate]);

  return <VerifyEmailRequiredPage email={data?.email ?? ''} />;
}

export const Route = createFileRoute('/verify-email-required')({
  // See routes/index.tsx for why this must be ssr: false.
  ssr: false,
  beforeLoad: async () => {
    if (!hasSessionCookie()) throw redirect({ to: '/login' });
    const state = await checkEmailVerification();
    if (!state || state.emailVerified) throw redirect({ to: '/dashboard' });
  },
  component: VerifyEmailRequiredRoute,
});
