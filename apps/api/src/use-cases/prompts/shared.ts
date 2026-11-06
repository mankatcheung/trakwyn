import type { LLMMessage } from '#src/use-cases/ports/ILLMProvider.js';

/**
 * The output rule three system prompts end on (resume match, job posting and
 * CV parsing). Written once so the three cannot drift apart; the providers'
 * `json` switch is a hint, and this sentence is what the models obey.
 */
export const RETURN_ONLY_VALID_JSON =
  'return ONLY valid JSON with no markdown, no explanation, and no code fences';

interface PromptMessagesInput {
  system: string;
  /** The user's own instructions from Settings, sent as a second system message. */
  customAiPrompt?: string | null;
  user: string;
}

/**
 * The shape every single-shot feature sends: our system prompt, the user's
 * optional custom prompt, then the request itself.
 *
 * The custom prompt is the user's data, not our wording, so it comes after the
 * versioned system text and does not count towards the prompt's version.
 */
export function promptMessages({
  system,
  customAiPrompt,
  user,
}: PromptMessagesInput): LLMMessage[] {
  return [
    { role: 'system', content: system },
    ...(customAiPrompt ? [{ role: 'system', content: customAiPrompt } as const] : []),
    { role: 'user', content: user },
  ];
}
