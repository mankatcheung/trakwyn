import { createFileRoute, redirect } from '@tanstack/react-router';
import { hasSessionCookie } from '#/graphql/client';
import { checkEmailVerification } from '#/lib/emailVerification';
import { checkOnboarding, needsWelcome } from '#/lib/onboarding';
import { AuthenticatedLayout } from './-components/AuthenticatedLayout';

export const Route = createFileRoute('/_authenticated')({
  // See routes/index.tsx for why this must be ssr: false.
  ssr: false,
  beforeLoad: ({ location }) => {
    if (!hasSessionCookie()) {
      // Remember the page the user asked for so login can send them straight
      // back to it (JEF-233); LoginPage falls back to /dashboard when the
      // parameter is absent or unsafe.
      throw redirect({ to: '/login', search: { returnTo: location.href } });
    }
    // An unverified account is sent to the full-page reminder before any child
    // route loads (JEF-438): their loaders would all be refused by the API and
    // land on the error boundary. Returning the promise makes the router wait
    // for it, and the answer is cached, so this is one request per session
    // once the user is verified. A user who has never finished or skipped the
    // welcome flow is then sent to it (JEF-460).
    return requireVerifiedEmail().then(() => requireOnboarded(location.pathname));
  },
  component: AuthenticatedLayout,
});

async function requireVerifiedEmail(): Promise<void> {
  const state = await checkEmailVerification();
  if (state && !state.emailVerified) throw redirect({ to: '/verify-email-required' });
  // Scheduled for deletion (JEF-463): the API refuses everything but cancel,
  // so the same full-page treatment as the verification wall.
  if (state?.deletionScheduledAt) throw redirect({ to: '/account-deletion-scheduled' });
}

async function requireOnboarded(pathname: string): Promise<void> {
  const state = await checkOnboarding();
  if (needsWelcome(state, pathname)) throw redirect({ to: '/welcome' });
}
