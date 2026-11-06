import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { aiCreditsView, useHostedAiAvailable, type AiCreditsView } from '#/lib/aiCredits';
import { billingStatusQueryKey, useBillingStatus, type AiFeature } from '#/lib/billingStatus';
import { newConversationRunsOn, useLlmSettings } from '#/routes/_authenticated/assistant/-runsOn';

export interface UseAiCredits {
  /** True when the next AI call is answered by Trakwyn AI and so spends credits. */
  onTrakwynAi: boolean;
  /** True once the provider order has loaded and nothing can answer: no key, no hosted AI. */
  needsSetup: boolean;
  view: AiCreditsView | null;
  /** Credits one run of the feature costs, or `null` when the API did not say. */
  costOf: (feature: AiFeature) => number | null;
  /** False only when the call would be on Trakwyn AI and the credits left do not cover it. */
  canAfford: (feature: AiFeature) => boolean;
  /** Re-reads the credits, for after a run has spent some. */
  refresh: () => Promise<void>;
}

/**
 * What the AI helpers need to know about credits (JEF-506): whether this user
 * is on Trakwyn AI at all (own-key calls cost nothing and show no numbers),
 * what an action costs, and whether what is left covers it.
 */
export function useAiCredits(): UseAiCredits {
  const queryClient = useQueryClient();
  const status = useBillingStatus();
  const hostedAi = useHostedAiAvailable();
  const { data, isPending } = useLlmSettings();
  const order = data?.me?.aiProviderOrder;

  const runsOn = newConversationRunsOn({ order, hostedAi });
  const onTrakwynAi = runsOn?.kind === 'trakwyn';
  const needsSetup = !isPending && order !== undefined && hostedAi === false && runsOn === null;
  const view = aiCreditsView(status?.aiCredits);

  const costOf = useCallback(
    (feature: AiFeature) =>
      status?.aiCredits?.costs?.find((c) => c.feature === feature)?.credits ?? null,
    [status],
  );
  const canAfford = useCallback(
    (feature: AiFeature) => {
      if (!onTrakwynAi || !view) return true;
      const cost = costOf(feature);
      return view.left > 0 && (cost === null || view.left >= cost);
    },
    [onTrakwynAi, view, costOf],
  );
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: billingStatusQueryKey }),
    [queryClient],
  );

  return { onTrakwynAi, needsSetup, view, costOf, canAfford, refresh };
}
