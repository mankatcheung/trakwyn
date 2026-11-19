import { describe, it, expect } from 'vitest';
import { formatCrossApplicationContext } from '#src/use-cases/shared/crossApplicationContext.js';
import { AI_PROMPT_INPUT } from '#src/use-cases/constants.js';

describe('formatCrossApplicationContext', () => {
  it('returns an empty string when there is neither a note nor a cover letter', () => {
    expect(formatCrossApplicationContext([], [])).toBe('');
  });

  it('includes note content', () => {
    const result = formatCrossApplicationContext(
      [{ content: 'Recruiter said they value async communication.' }],
      [],
    );

    expect(result).toContain('Recruiter said they value async communication.');
  });

  it('includes cover letter plain text', () => {
    const result = formatCrossApplicationContext(
      [],
      [{ plainText: 'Dear Hiring Manager, I bring five years of platform engineering.' }],
    );

    expect(result).toContain('I bring five years of platform engineering.');
  });

  it('skips a cover letter draft with empty plain text', () => {
    const result = formatCrossApplicationContext([], [{ plainText: '   ' }]);

    expect(result).toBe('');
  });

  it('never includes a company or employer name — the caller only ever passes content, never the application itself', () => {
    // Structural guarantee, not a string check: formatCrossApplicationContext's
    // signature only accepts `content`/`plainText`, so there is no company or
    // role field it could echo even if it wanted to (JEF-249, JEF-205).
    const note = { content: 'Went well, they liked my Kafka experience.' };
    const result = formatCrossApplicationContext([note], []);

    expect(Object.keys(note)).toEqual(['content']);
    expect(result).toContain('Went well');
  });

  it('instructs the model not to name another employer or application', () => {
    const result = formatCrossApplicationContext([{ content: 'x' }], []);

    expect(result.toLowerCase()).toMatch(/do not state or imply anything about another employer/);
  });

  it('caps the combined content instead of sending it whole', () => {
    const result = formatCrossApplicationContext(
      [{ content: 'x'.repeat(20_000) }],
      [{ plainText: 'y'.repeat(20_000) }],
    );

    expect(result.length).toBeLessThan(AI_PROMPT_INPUT.CROSS_APPLICATION_CONTEXT_MAX_CHARS + 500);
  });
});
