import { AI_PROMPT_MAX_LENGTH } from '#/components/ai/AiPromptInput';

/**
 * The inline AI actions on a selection (JEF-583). Each is an `instructions`
 * preset for the existing Polish action, so the API, its prompt, its credit
 * cost and its rate limit are all the ones the AI helper panel already uses.
 */
export type InlineAiActionId = 'rewrite' | 'shorten' | 'formal' | 'grammar';

export interface InlineAiAction {
  id: InlineAiActionId;
  labelKey: string;
  /** What the model is asked to do with the text. Kept short: the API refuses over 500 characters. */
  instruction: string;
}

export const INLINE_AI_ACTIONS: readonly InlineAiAction[] = [
  {
    id: 'rewrite',
    labelKey: 'documents.editor.ai.rewrite',
    instruction:
      'Rewrite this text so it reads more clearly and with more impact. Keep its meaning and facts, and about the same length.',
  },
  {
    id: 'shorten',
    labelKey: 'documents.editor.ai.shorten',
    instruction:
      'Make this text shorter, about half its length. Keep the key facts and the meaning.',
  },
  {
    id: 'formal',
    labelKey: 'documents.editor.ai.formal',
    instruction:
      'Rewrite this text in a more formal, professional tone. Keep its meaning and facts.',
  },
  {
    id: 'grammar',
    labelKey: 'documents.editor.ai.grammar',
    instruction:
      'Fix spelling, grammar and punctuation only. Do not change the wording, tone or meaning otherwise.',
  },
];

export type InlineAiRequest =
  { kind: 'preset'; action: InlineAiActionId } | { kind: 'custom'; text: string };

/**
 * Polish was written for a whole document and answers with "the full revised
 * document". A passage is not one, so every request says so first.
 */
const PASSAGE_RULE =
  'The text is one passage from a longer document. Revise only that passage and reply with the revised passage alone. ';

/** Room left for the user's own words once the passage rule is in. */
export const INLINE_AI_CUSTOM_MAX_CHARS = AI_PROMPT_MAX_LENGTH - PASSAGE_RULE.length;

/** The `instructions` sent with the passage, or null when there is nothing to ask. */
export function inlineAiInstructions(request: InlineAiRequest): string | null {
  if (request.kind === 'custom') {
    const text = request.text.trim();
    return text ? `${PASSAGE_RULE}${text.slice(0, INLINE_AI_CUSTOM_MAX_CHARS)}` : null;
  }
  const action = INLINE_AI_ACTIONS.find((a) => a.id === request.action);
  return action ? `${PASSAGE_RULE}${action.instruction}` : null;
}
