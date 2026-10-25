import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import {
  EMAIL_VERIFICATION_QUERY,
  RESEND_VERIFICATION_EMAIL_MUTATION,
} from '../graphql/operations';

export interface EmailVerificationState {
  email: string;
  emailVerified: boolean;
}

export const emailVerificationQueryKey = ['me', 'emailVerification'] as const;

/**
 * Whether the signed-in user has verified their email (JEF-438). Until they
 * have, the API refuses everything but a handful of operations, and the app
 * shows `VerifyEmailRequiredScreen` instead of its tabs.
 */
export function useEmailVerification() {
  const query = useQuery({
    queryKey: emailVerificationQueryKey,
    queryFn: async (): Promise<EmailVerificationState | null> => {
      const data = await gqlRequest<{ me: EmailVerificationState | null }>(
        EMAIL_VERIFICATION_QUERY,
      );
      return data.me;
    },
    staleTime: 10_000,
  });

  // The user opens the link in their mail app and comes back: React Native has
  // no window focus, so the foreground is the moment to ask again.
  const { refetch, data } = query;
  const unverified = data !== undefined && data !== null && !data.emailVerified;
  useEffect(() => {
    if (!unverified) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch();
    });
    return () => subscription.remove();
  }, [unverified, refetch]);

  return query;
}

export function useResendVerificationEmail() {
  return useMutation({
    mutationFn: () =>
      gqlRequest<{ resendVerificationEmail: boolean }>(RESEND_VERIFICATION_EMAIL_MUTATION),
  });
}
