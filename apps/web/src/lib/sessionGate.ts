import { gqlClient } from '#/graphql/client';
import { queryClient } from '#/lib/queryClient';
import { EMAIL_VERIFICATION_KEY, type EmailVerificationState } from '#/lib/emailVerification';
import { ONBOARDING_STATE_KEY, type OnboardingState } from '#/lib/onboarding';

/**
 * Everything the authenticated shell asks before a child route loads (JEF-535):
 * email verification (JEF-438), a scheduled deletion (JEF-463) and the welcome
 * flow (JEF-460). One request answers all three, so the guard costs a single
 * round trip instead of two in a row.
 */
export const SESSION_GATE_QUERY = `query SessionGate { me { email emailVerified deletionScheduledAt onboardingCompletedAt onboardingGoals } }`;

type SessionGateResponse = {
  me: (EmailVerificationState & OnboardingState) | null;
};

/** How long an unfinished answer is trusted: the user may finish it in another tab or app. */
const UNFINISHED_STALE_MS = 10_000;

export interface SessionGate {
  verification: EmailVerificationState | null;
  onboarding: OnboardingState | null;
}

function verificationStaleMs(state: EmailVerificationState): number {
  return state.emailVerified && !state.deletionScheduledAt ? Infinity : UNFINISHED_STALE_MS;
}

function onboardingStaleMs(state: OnboardingState): number {
  return state.onboardingCompletedAt ? Infinity : UNFINISHED_STALE_MS;
}

/** Cached data that is still within its stale time, else `undefined`. */
function freshData<T>(key: readonly unknown[], staleMs: (data: T) => number): T | undefined {
  const state = queryClient.getQueryState<T | null>(key);
  if (!state?.data) return undefined;
  return Date.now() - state.dataUpdatedAt < staleMs(state.data) ? state.data : undefined;
}

/**
 * For the `_authenticated` guard. Reads the two per-concern caches that the
 * wall, the welcome page and the settings danger zone already share, and
 * fetches once, writing both, only when either is missing or stale. A failed
 * check is `null` for both, which the guard treats as "let them in": the API
 * enforces the wall itself, so this is the polite layer.
 */
export function checkSessionGate(): Promise<SessionGate> {
  // The router can run the guard more than once at the same moment (initial
  // load, hydration); those calls share one request, as `fetchQuery` did.
  inFlight ??= readSessionGate().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

let inFlight: Promise<SessionGate> | null = null;

async function readSessionGate(): Promise<SessionGate> {
  const verification = freshData<EmailVerificationState>(
    EMAIL_VERIFICATION_KEY,
    verificationStaleMs,
  );
  const onboarding = freshData<OnboardingState>(ONBOARDING_STATE_KEY, onboardingStaleMs);
  if (verification && onboarding) return { verification, onboarding };

  try {
    const data = await gqlClient.request<SessionGateResponse>(SESSION_GATE_QUERY);
    if (!data.me) return { verification: null, onboarding: null };
    const { email, emailVerified, deletionScheduledAt, onboardingCompletedAt, onboardingGoals } =
      data.me;
    const fresh: SessionGate = {
      verification: { email, emailVerified, deletionScheduledAt },
      onboarding: { onboardingCompletedAt, onboardingGoals },
    };
    queryClient.setQueryData(EMAIL_VERIFICATION_KEY, fresh.verification);
    queryClient.setQueryData(ONBOARDING_STATE_KEY, fresh.onboarding);
    return fresh;
  } catch {
    return { verification: null, onboarding: null };
  }
}
