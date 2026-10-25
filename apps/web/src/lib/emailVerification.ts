import { useQuery } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { queryClient } from '#/lib/queryClient';

/**
 * Whether the signed-in user has verified their email (JEF-438). Until they
 * have, the API refuses everything but a handful of operations. The
 * authenticated shell redirects such a user to `/verify-email-required`
 * before any child route loads (those loaders would only fail), and that
 * page is the full-page reminder.
 */
export const EMAIL_VERIFICATION_QUERY = `query EmailVerification { me { email emailVerified } }`;

export const RESEND_VERIFICATION_EMAIL = `mutation ResendVerificationEmail { resendVerificationEmail }`;

/** Query key shared by the route guards and the wall, so a check from any of them updates all. */
export const EMAIL_VERIFICATION_KEY = ['me', 'emailVerification'] as const;

/**
 * How long the resend button stays off after a link is sent. The API allows
 * three a day per account; this stops a double click, not abuse.
 */
export const RESEND_COOLDOWN_SECONDS = 60;

export interface EmailVerificationState {
  email: string;
  emailVerified: boolean;
}

async function fetchEmailVerification(): Promise<EmailVerificationState | null> {
  const data = await gqlClient.request<{ me: EmailVerificationState | null }>(
    EMAIL_VERIFICATION_QUERY,
  );
  return data.me;
}

const emailVerificationQueryOptions = {
  queryKey: EMAIL_VERIFICATION_KEY,
  queryFn: fetchEmailVerification,
  // Verified is permanent, so the guard on every navigation costs one request
  // per session. Unverified is rechecked soon: the user is expected to verify
  // in another tab or app and come back.
  staleTime: (query: { state: { data: EmailVerificationState | null | undefined } }) =>
    query.state.data?.emailVerified ? Infinity : 10_000,
};

/**
 * For route guards. A failed check is `null`, which a guard treats as "let
 * them in": the API refuses an unverified user's requests itself, so this is
 * the polite layer and not the enforcement.
 */
export async function checkEmailVerification(): Promise<EmailVerificationState | null> {
  try {
    return await queryClient.fetchQuery(emailVerificationQueryOptions);
  } catch {
    return null;
  }
}

export function useEmailVerification() {
  return useQuery({
    ...emailVerificationQueryOptions,
    // The user verifies in another tab or app, then comes back: a refetch on
    // focus lifts the wall without a reload.
    refetchOnWindowFocus: true,
  });
}
