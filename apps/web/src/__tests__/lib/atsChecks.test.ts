import { describe, expect, it } from 'vitest';
import {
  ATS_LENGTH_LIMITS,
  checkResume,
  parseResumeDoc,
  type AtsHint,
} from '#/lib/editor/atsChecks';
import type { TiptapNode } from '#/lib/markdownToTiptapDoc';

const p = (text: string): TiptapNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
const h = (text: string): TiptapNode => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text }],
});
const doc = (...content: TiptapNode[]): TiptapNode => ({ type: 'doc', content });
const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');
const ids = (hints: AtsHint[]) => hints.map((x) => x.id);

// A resume that trips no rule: contact line, headings, a sensible length.
const clean = () =>
  doc(
    p('Ada Lovelace ada@example.com +44 20 7946 0958'),
    h('Experience'),
    p(words(300)),
    h('Education'),
    p(words(50)),
  );

describe('checkResume', () => {
  it('has no hints for a clean resume', () => {
    expect(checkResume(clean())).toEqual([]);
  });

  it('has no hints for an empty document, so a new draft is not nagged', () => {
    expect(checkResume(doc({ type: 'paragraph' }))).toEqual([]);
  });

  it('flags a table and points at its top-level block', () => {
    const d = clean();
    d.content!.splice(2, 0, { type: 'table', content: [] });
    const hint = checkResume(d).find((x) => x.id === 'table');
    expect(hint).toMatchObject({
      severity: 'warn',
      messageKey: 'documentChecks.table',
      nodeIndex: 2,
    });
  });

  it('clears the table hint once the table is gone', () => {
    const d = clean();
    d.content!.push({ type: 'table', content: [] });
    expect(ids(checkResume(d))).toContain('table');
    expect(ids(checkResume(clean()))).not.toContain('table');
  });

  it('finds a table nested in another block', () => {
    const d = doc(
      p('a@b.co'),
      h('Experience'),
      { type: 'blockquote', content: [{ type: 'table', content: [] }] },
      p(words(200)),
    );
    expect(checkResume(d).find((x) => x.id === 'table')?.nodeIndex).toBe(2);
  });

  it('flags a resume with no headings', () => {
    const d = doc(p('a@b.co'), p(words(300)));
    expect(ids(checkResume(d))).toContain('noHeadings');
    expect(ids(checkResume(clean()))).not.toContain('noHeadings');
  });

  it('flags a missing email and phone', () => {
    const d = doc(h('Experience'), p(words(300)));
    expect(ids(checkResume(d))).toContain('noContact');
  });

  it.each([
    ['an email', 'Reach me at ada@example.com'],
    ['a phone number', 'Call +1 (415) 555-0132'],
  ])('accepts %s as contact details', (_label, line) => {
    const d = doc(p(line), h('Experience'), p(words(300)));
    expect(ids(checkResume(d))).not.toContain('noContact');
  });

  it('does not take a short number such as a year for a phone number', () => {
    const d = doc(p('Since 2019, 40 people'), h('Experience'), p(words(300)));
    expect(ids(checkResume(d))).toContain('noContact');
  });

  it('flags a very long and a very short resume', () => {
    const long = doc(p('a@b.co'), h('Experience'), p(words(ATS_LENGTH_LIMITS.maxWords + 1)));
    const short = doc(p('a@b.co'), h('Experience'), p(words(ATS_LENGTH_LIMITS.minWords - 10)));
    expect(ids(checkResume(long))).toContain('tooLong');
    expect(ids(checkResume(short))).toContain('tooShort');
    expect(ids(checkResume(clean()))).not.toContain('tooLong');
    expect(ids(checkResume(clean()))).not.toContain('tooShort');
  });

  it('reports hints in a stable order so the list does not jump while typing', () => {
    const d = doc(p(words(5)));
    expect(ids(checkResume(d))).toEqual(['noHeadings', 'noContact', 'tooShort']);
  });
});

describe('parseResumeDoc', () => {
  it('returns the document for valid JSON', () => {
    expect(parseResumeDoc(JSON.stringify(clean()))?.type).toBe('doc');
  });

  it('returns null for broken or non-document JSON', () => {
    expect(parseResumeDoc('{nope')).toBeNull();
    expect(parseResumeDoc('42')).toBeNull();
    expect(parseResumeDoc('{"type":"paragraph"}')).toBeNull();
  });
});
