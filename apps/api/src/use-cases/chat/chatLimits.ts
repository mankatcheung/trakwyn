import { CHAT, LLM_USAGE_SOURCE } from '#src/use-cases/constants.js';
import type { LLMProviderResolution } from '#src/use-cases/ports/ILLMProviderFactory.js';

export interface ChatLimits {
  maxToolIterations: number;
  maxHistoryChars: number;
}

/**
 * The loop and history caps for one chat turn (JEF-448). A Free user on the
 * platform's key gets the tighter `CHAT.HOSTED_FREE`; Pro and the user's own
 * key keep the defaults.
 */
export function chatLimitsFor(
  resolution: Pick<LLMProviderResolution, 'source' | 'plan'> | null,
): ChatLimits {
  if (resolution?.source === LLM_USAGE_SOURCE.PLATFORM && resolution.plan === 'free') {
    return {
      maxToolIterations: CHAT.HOSTED_FREE.MAX_TOOL_ITERATIONS,
      maxHistoryChars: CHAT.HOSTED_FREE.MAX_HISTORY_CHARS,
    };
  }
  return { maxToolIterations: CHAT.MAX_TOOL_ITERATIONS, maxHistoryChars: CHAT.MAX_HISTORY_CHARS };
}
