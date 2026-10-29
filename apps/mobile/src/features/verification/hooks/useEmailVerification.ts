import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import {
  CANCEL_ACCOUNT_DELETION_MUTATION,
  EMAIL_VERIFICATION_QUERY,
  RESEND_VERIFICATION_EMAIL_MUTATION,
} from '../graphql/operations';

export interface EmailVerificationState {
  email: string;
  emailVerified: boolean;
  /** When the account will be deleted (JEF-463), or null. While set the app shows only the cancel screen. */
  deletionScheduledAt: string | null;
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

/** Cancels a scheduled deletion, then re-reads the account so the app opens again (JEF-463). */
export function useCancelAccountDeletion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      gqlRequest<{ cancelAccountDeletion: boolean }>(CANCEL_ACCOUNT_DELETION_MUTATION),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: emailVerificationQueryKey }),
  });
}

export function useResendVerificationEmail() {
  return useMutation({
    mutationFn: () =>
      gqlRequest<{ resendVerificationEmail: boolean }>(RESEND_VERIFICATION_EMAIL_MUTATION),
  });
}
