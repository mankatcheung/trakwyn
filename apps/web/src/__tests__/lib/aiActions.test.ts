import { describe, expect, it } from 'vitest';
import {
  INLINE_AI_ACTIONS,
  INLINE_AI_CUSTOM_MAX_CHARS,
  inlineAiInstructions,
} from '#/lib/editor/aiActions';
import { AI_PROMPT_MAX_LENGTH } from '#/components/ai/AiPromptInput';

describe('inline AI actions (JEF-583)', () => {
  it('offers rewrite, shorten, formal and grammar, in that order', () => {
    expect(INLINE_AI_ACTIONS.map((a) => a.id)).toEqual(['rewrite', 'shorten', 'formal', 'grammar']);
  });

  it.each(INLINE_AI_ACTIONS.map((a) => a.id))(
    'turns %s into instructions the API accepts, saying the text is one passage',
    (action) => {
      const instructions = inlineAiInstructions({ kind: 'preset', action })!;
      expect(instructions.length).toBeLessThanOrEqual(AI_PROMPT_MAX_LENGTH);
      expect(instructions).toContain('one passage from a longer document');
      expect(instructions).toContain(INLINE_AI_ACTIONS.find((a) => a.id === action)!.instruction);
    },
  );

  it('keeps each preset different, so a button cannot send another one’s ask', () => {
    const all = INLINE_AI_ACTIONS.map((a) =>
      inlineAiInstructions({ kind: 'preset', action: a.id }),
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it('puts the user’s own words after the passage rule', () => {
    const out = inlineAiInstructions({ kind: 'custom', text: '  Make it sound warmer  ' })!;
    expect(out.startsWith('The text is one passage')).toBe(true);
    expect(out.endsWith('Make it sound warmer')).toBe(true);
  });

  it('returns nothing for an empty custom ask', () => {
    expect(inlineAiInstructions({ kind: 'custom', text: '   ' })).toBeNull();
  });

  it('never goes over what the API takes, however long the ask', () => {
    const out = inlineAiInstructions({ kind: 'custom', text: 'x'.repeat(5000) })!;
    expect(out.length).toBe(AI_PROMPT_MAX_LENGTH);
    expect(INLINE_AI_CUSTOM_MAX_CHARS).toBeGreaterThan(300);
  });
});
