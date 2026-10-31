import { createFileRoute, redirect } from '@tanstack/react-router';
import { hasSessionCookie } from '#/graphql/client';
import { checkEmailVerification, useEmailVerification } from '#/lib/emailVerification';
import { AccountDeletionScheduledPage } from './-components/AccountDeletionScheduledPage';

/**
 * The full page a signed-in account scheduled for deletion gets in place of
 * the app (JEF-463), the same way `/verify-email-required` stands in for an
 * unverified one. An account that is not scheduled is sent on to the app.
 */
function AccountDeletionScheduledRoute() {
  const { data } = useEmailVerification();
  // Cancelling refetches this state with no date before the page navigates
  // away; rendering with an empty date would throw "Invalid time value".
  if (!data?.deletionScheduledAt) return null;
  return <AccountDeletionScheduledPage deletionScheduledAt={data.deletionScheduledAt} />;
}

export const Route = createFileRoute('/account-deletion-scheduled')({
  // See routes/index.tsx for why this must be ssr: false.
  ssr: false,
  beforeLoad: async () => {
    if (!hasSessionCookie()) throw redirect({ to: '/login' });
    const state = await checkEmailVerification();
    if (!state?.deletionScheduledAt) throw redirect({ to: '/dashboard' });
  },
  component: AccountDeletionScheduledRoute,
});
