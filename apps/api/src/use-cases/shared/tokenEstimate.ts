import type { LLMMessage, LLMToolDefinition } from '#src/use-cases/ports/ILLMProvider.js';

/**
 * A rough prompt-token count for when the provider never told us (F3):
 * a stream aborted before an OpenAI-compatible or Gemini backend reached
 * its final usage chunk. ~4 characters per token is the usual English
 * average; the tool schemas are counted because they are sent every call.
 * Deliberately simple — it exists so an aborted call is charged roughly
 * rather than not at all, and every event it produces is flagged
 * `estimated`.
 */
export const CHARS_PER_TOKEN_ESTIMATE = 4;

export function estimatePromptTokens(
  messages: readonly LLMMessage[],
  tools: readonly LLMToolDefinition[] = [],
): number {
  const messageChars = messages.reduce(
    (sum, m) => sum + m.content.length + (m.toolCalls ? JSON.stringify(m.toolCalls).length : 0),
    0,
  );
  const toolChars = tools.reduce(
    (sum, t) => sum + t.name.length + t.description.length + JSON.stringify(t.parameters).length,
    0,
  );
  return Math.ceil((messageChars + toolChars) / CHARS_PER_TOKEN_ESTIMATE);
}
