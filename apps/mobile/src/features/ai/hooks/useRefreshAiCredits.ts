import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { llmApiKeysQueryKey } from '../../settings/hooks/useLlmApiKeys';

/**
 * Re-reads the credits meter. The hooks of the AI actions call this from
 * `onSettled`, whatever the outcome, so the count stays current on every
 * screen that shows it (JEF-509).
 */
export function useRefreshAiCredits(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: llmApiKeysQueryKey }),
    [queryClient],
  );
}
