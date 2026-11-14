/**
 * The AI actions on selected text (JEF-587). Each is an `instructions` preset
 * for the existing Polish action, so the API, its prompt, its credit cost and
 * its rate limit are the ones the AI helper sheet already uses.
 *
 * Twin of apps/web's `lib/editor/aiActions.ts` (JEF-583): keep the instruction
 * strings identical. `aiActions.test.ts` here and web's test pin them.
 */
export const AI_PROMPT_MAX_LENGTH = 500;

export type SelectionAiActionId = 'rewrite' | 'shorten' | 'formal' | 'grammar';

export interface SelectionAiAction {
  id: SelectionAiActionId;
  /** Key in the `documents` i18n namespace. */
  labelKey: string;
  /** What the model is asked to do with the text. Kept short: the API refuses over 500 characters. */
  instruction: string;
}

export const SELECTION_AI_ACTIONS: readonly SelectionAiAction[] = [
  {
    id: 'rewrite',
    labelKey: 'aiActionRewrite',
    instruction:
      'Rewrite this text so it reads more clearly and with more impact. Keep its meaning and facts, and about the same length.',
  },
  {
    id: 'shorten',
    labelKey: 'aiActionShorten',
    instruction:
      'Make this text shorter, about half its length. Keep the key facts and the meaning.',
  },
  {
    id: 'formal',
    labelKey: 'aiActionFormal',
    instruction:
      'Rewrite this text in a more formal, professional tone. Keep its meaning and facts.',
  },
  {
    id: 'grammar',
    labelKey: 'aiActionGrammar',
    instruction:
      'Fix spelling, grammar and punctuation only. Do not change the wording, tone or meaning otherwise.',
  },
];

export type SelectionAiRequest =
  { kind: 'preset'; action: SelectionAiActionId } | { kind: 'custom'; text: string };

/**
 * Polish was written for a whole document and answers with "the full revised
 * document". A passage is not one, so every request says so first.
 */
const PASSAGE_RULE =
  'The text is one passage from a longer document. Revise only that passage and reply with the revised passage alone. ';

/** Room left for the user's own words once the passage rule is in. */
export const SELECTION_AI_CUSTOM_MAX_CHARS = AI_PROMPT_MAX_LENGTH - PASSAGE_RULE.length;

/** The `instructions` sent with the passage, or null when there is nothing to ask. */
export function selectionAiInstructions(request: SelectionAiRequest): string | null {
  if (request.kind === 'custom') {
    const text = request.text.trim();
    return text ? `${PASSAGE_RULE}${text.slice(0, SELECTION_AI_CUSTOM_MAX_CHARS)}` : null;
  }
  const action = SELECTION_AI_ACTIONS.find((a) => a.id === request.action);
  return action ? `${PASSAGE_RULE}${action.instruction}` : null;
}
