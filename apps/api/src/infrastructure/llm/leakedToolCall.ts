import { LEAKED_TOOL_CALL } from '#src/infrastructure/config/constants.js';
import { LlmProviderError } from '#src/use-cases/errors/DomainError.js';

/** Content carries a model channel marker (`<|call|>` and friends). */
export function hasChannelMarkers(content: string): boolean {
  return LEAKED_TOOL_CALL.MARKER.test(content);
}

/**
 * Content so far looks like a gpt-oss tool call leaked into the message text
 * (JEF-541): markers, or reasoning that opens with "analysis". A stream holds
 * such text back instead of showing it.
 */
export function looksLikeLeakedToolCall(content: string): boolean {
  return (
    hasChannelMarkers(content) ||
    content.trimStart().toLowerCase().startsWith(LEAKED_TOOL_CALL.TEXT_PREFIX)
  );
}

/** Content is gpt-oss's reasoning channel shown as the answer (JEF-554). */
export function looksLikeReasoningText(content: string): boolean {
  return LEAKED_TOOL_CALL.REASONING_LABEL.test(content.trimStart());
}

/**
 * Throws when a finished completion is a leak: markers, or reasoning text
 * labelled "analysis", and no tool call. `unavailable` is a kind
 * `FailoverLLMProvider` moves to the next leg on.
 */
export function assertNoLeakedToolCall(content: string, toolCallCount: number): void {
  if (toolCallCount !== 0) return;
  if (hasChannelMarkers(content)) {
    throw new LlmProviderError('unavailable', {
      detail: 'Completion carried channel markers and no tool calls',
    });
  }
  if (looksLikeReasoningText(content)) {
    throw new LlmProviderError('unavailable', {
      detail: 'Completion was reasoning text labelled "analysis" and no tool calls',
    });
  }
}
