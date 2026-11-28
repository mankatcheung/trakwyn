import { createFileRoute, redirect } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { hasSessionCookie } from '#/graphql/client';
import { needsWelcome } from '#/features/onboarding/graphql/onboardingQueries';
import { checkSessionGate, type SessionGate } from '#/features/auth/graphql/sessionGate';
import { AuthenticatedLayout } from '../../features/app-shell/pages/AuthenticatedLayout';
import { AppShellPending } from '../../features/app-shell/pages/AppShellPending';
import { prefetchDashboard } from '../../features/dashboard/graphql/dashboardQueries';

export const Route = createFileRoute('/_authenticated')({
  // See routes/index.tsx for why this must be ssr: false.
  ssr: false,
  beforeLoad: ({ location, context }) => {
    if (!hasSessionCookie()) {
      // Remember the page the user asked for so login can send them straight
      // back to it (JEF-233); LoginPage falls back to /dashboard when the
      // parameter is absent or unsafe.
      throw redirect({ to: '/login', search: { returnTo: location.href } });
    }
    // The dashboard's queries start now, not after the gate answers (JEF-535).
    // A redirect wastes them; the common case, a verified and onboarded user,
    // saves a whole round trip.
    startPagePrefetch(context?.queryClient, location.pathname);
    // An unverified account is sent to the full-page reminder before any child
    // route loads (JEF-438): their loaders would all be refused by the API and
    // land on the error boundary. Returning the promise makes the router wait
    // for it. One request answers the verification, scheduled-deletion and
    // welcome checks (JEF-460, JEF-463), and the answer is cached, so this is
    // one request per session once the user is verified and onboarded.
    return checkSessionGate().then((gate) => applyGate(gate, location.pathname));
  },
  component: AuthenticatedLayout,
  // With `ssr: false` this is what the server renders, so the frame is on
  // screen before the JavaScript and the session gate. No minimum time: the
  // default (500ms) would hold it after the app is ready.
  pendingComponent: AppShellPending,
  pendingMinMs: 0,
});

function startPagePrefetch(queryClient: QueryClient | undefined, pathname: string): void {
  if (!queryClient) return;
  if (pathname === '/dashboard' || pathname === '/dashboard/') {
    void prefetchDashboard(queryClient, { speculative: true });
  }
}

function applyGate({ verification, onboarding }: SessionGate, pathname: string): void {
  if (verification && !verification.emailVerified) {
    throw redirect({ to: '/verify-email-required' });
  }
  // Scheduled for deletion (JEF-463): the API refuses everything but cancel,
  // so the same full-page treatment as the verification wall.
  if (verification?.deletionScheduledAt) throw redirect({ to: '/account-deletion-scheduled' });
  if (needsWelcome(onboarding, pathname)) throw redirect({ to: '/welcome' });
}
