import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { aiCreditsStanding, hostedAiAvailable, type AiCreditsStanding } from '../lib/aiCredits';
import { TRAKWYN_ENTRY } from '../lib/aiProviderOrder';
import { llmApiKeysQueryKey, useLlmApiKeys } from './useLlmApiKeys';

/** The hosted features whose cost the API reports (`billingStatus.aiCredits.costs`). */
export type AiFeature = 'coverLetter' | 'resume' | 'polishDraft';

export interface UseAiCredits {
  /** True when the next AI call is answered by Trakwyn AI and so spends credits. */
  onTrakwynAi: boolean;
  /** True once the provider order has loaded and nothing can answer: no key, no hosted AI. */
  needsSetup: boolean;
  standing: AiCreditsStanding | null;
  /** Credits one run of the feature costs, or `null` when the API did not say. */
  costOf: (feature: AiFeature) => number | null;
  /** False only when the call would be on Trakwyn AI and the credits left do not cover it. */
  canAfford: (feature: AiFeature) => boolean;
  /** Re-reads the credits, for after a run has spent some. */
  refresh: () => Promise<void>;
}

/**
 * What the AI helpers need to know about credits (JEF-508, the mobile twin of
 * web's `useAiCredits`): whether this user is on Trakwyn AI at all (own-key
 * calls cost nothing and show no numbers), what an action costs, and whether
 * what is left covers it. Read from the same `llmApiKeys` query as Settings → AI.
 */
export function useAiCredits(): UseAiCredits {
  const queryClient = useQueryClient();
  const { data } = useLlmApiKeys();
  const order = data?.aiProviderOrder;
  const credits = data?.aiCredits;
  const hostedAi = data ? hostedAiAvailable(credits) : null;

  // The first entry that can answer: Trakwyn AI cannot on a plan without it.
  const answering = order?.find((entry) => entry !== TRAKWYN_ENTRY || hostedAi !== false);
  const onTrakwynAi = answering === TRAKWYN_ENTRY;
  const needsSetup = order !== undefined && hostedAi === false && answering === undefined;
  const standing = credits && hostedAiAvailable(credits) ? aiCreditsStanding(credits) : null;

  const costOf = useCallback(
    (feature: AiFeature) => credits?.costs?.find((c) => c.feature === feature)?.credits ?? null,
    [credits],
  );
  const canAfford = useCallback(
    (feature: AiFeature) => {
      if (!onTrakwynAi || !standing) return true;
      const cost = costOf(feature);
      return standing.left > 0 && (cost === null || standing.left >= cost);
    },
    [onTrakwynAi, standing, costOf],
  );
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: llmApiKeysQueryKey }),
    [queryClient],
  );

  return { onTrakwynAi, needsSetup, standing, costOf, canAfford, refresh };
}
