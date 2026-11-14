import {
  AI_PROMPT_MAX_LENGTH,
  SELECTION_AI_ACTIONS,
  SELECTION_AI_CUSTOM_MAX_CHARS,
  selectionAiInstructions,
} from '../aiActions';

describe('selection AI presets', () => {
  it('maps every action to instructions that start with the passage rule', () => {
    for (const action of SELECTION_AI_ACTIONS) {
      const text = selectionAiInstructions({ kind: 'preset', action: action.id });
      expect(text).toContain('one passage from a longer document');
      expect(text).toContain(action.instruction);
    }
  });

  // Twin of apps/web/src/lib/editor/aiActions.ts: the strings must stay identical.
  it('keeps the same instruction text as web', () => {
    expect(SELECTION_AI_ACTIONS.map((a) => [a.id, a.instruction])).toEqual([
      [
        'rewrite',
        'Rewrite this text so it reads more clearly and with more impact. Keep its meaning and facts, and about the same length.',
      ],
      [
        'shorten',
        'Make this text shorter, about half its length. Keep the key facts and the meaning.',
      ],
      [
        'formal',
        'Rewrite this text in a more formal, professional tone. Keep its meaning and facts.',
      ],
      [
        'grammar',
        'Fix spelling, grammar and punctuation only. Do not change the wording, tone or meaning otherwise.',
      ],
    ]);
  });

  it('keeps every preset under the API limit', () => {
    for (const action of SELECTION_AI_ACTIONS) {
      const text = selectionAiInstructions({ kind: 'preset', action: action.id })!;
      expect(text.length).toBeLessThanOrEqual(AI_PROMPT_MAX_LENGTH);
    }
  });

  it('trims and caps a custom request, and refuses an empty one', () => {
    expect(selectionAiInstructions({ kind: 'custom', text: '   ' })).toBeNull();
    const long = selectionAiInstructions({ kind: 'custom', text: 'x'.repeat(900) })!;
    expect(long.length).toBeLessThanOrEqual(AI_PROMPT_MAX_LENGTH);
    expect(long.endsWith('x'.repeat(SELECTION_AI_CUSTOM_MAX_CHARS))).toBe(true);
    expect(selectionAiInstructions({ kind: 'custom', text: '  be bold ' })).toMatch(/be bold$/);
  });
});
