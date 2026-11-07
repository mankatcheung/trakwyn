import { describe, it, expect } from 'vitest';
import { resumeToTiptapDoc } from '#src/use-cases/shared/resumeToTiptapDoc.js';
import { scoreResumeText } from '#src/use-cases/shared/scoreResumeText.js';

const parse = (json: string) =>
  JSON.parse(json) as { type: string; content: Array<Record<string, unknown>> };

const RESUME = {
  summary: 'Engineer.',
  experience: [
    {
      company: 'Acme',
      title: 'Engineer',
      period: '2020 – 2022',
      bullets: ['Built widgets', 'Shipped things'],
    },
  ],
  education: [{ institution: 'State University', qualification: 'BSc CS', period: '2016 – 2020' }],
  skills: [{ category: 'Languages', items: ['TypeScript', 'Go'] }],
};

describe('resumeToTiptapDoc', () => {
  it('renders headings and bullet lists, not flat paragraphs', () => {
    const doc = parse(resumeToTiptapDoc(RESUME).contentJson);

    const types = doc.content.map((n) => n.type);
    expect(types).toContain('heading');
    expect(types).toContain('bulletList');
  });

  it('puts the role, employer and period in one heading', () => {
    const doc = parse(resumeToTiptapDoc(RESUME).contentJson);
    const headings = doc.content.filter((n) => n.type === 'heading');

    expect(JSON.stringify(headings)).toContain('Engineer — Acme (2020 – 2022)');
  });

  it('writes a bullet per achievement', () => {
    const doc = parse(resumeToTiptapDoc(RESUME).contentJson);
    const list = doc.content.find((n) => n.type === 'bulletList') as { content: unknown[] };

    expect(list.content).toHaveLength(2);
  });

  it('omits a bullet list for a role with no bullets', () => {
    const doc = parse(
      resumeToTiptapDoc({
        ...RESUME,
        experience: [{ company: 'Acme', title: 'Engineer', bullets: [] }],
      }).contentJson,
    );

    expect(doc.content.some((n) => n.type === 'bulletList')).toBe(false);
  });

  it('never emits an empty text node, which the editor rejects on load', () => {
    const doc = resumeToTiptapDoc({
      summary: '',
      experience: [{ company: 'Acme', title: 'Engineer', bullets: ['', '  '] }],
      education: [],
      skills: [],
    });

    expect(doc.contentJson).not.toContain('"text":""');
  });

  it('produces a valid document even when the resume is entirely empty', () => {
    const doc = parse(resumeToTiptapDoc({ experience: [], education: [], skills: [] }).contentJson);

    expect(doc).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });

  it('keeps a plain-text rendering alongside, for search and the match scorer', () => {
    const { plainText } = resumeToTiptapDoc(RESUME);

    expect(plainText).toContain('Built widgets');
    expect(plainText).toContain('State University');
    expect(plainText).toContain('TypeScript');
  });

  describe('contact header (JEF-526)', () => {
    const CONTACT = { name: 'Ada Lovelace', email: 'ada@example.com', details: [] };

    it('puts the name as a level-1 heading and the email line before Summary', () => {
      const out = resumeToTiptapDoc(RESUME, CONTACT);
      const doc = parse(out.contentJson);

      expect(doc.content[0]).toMatchObject({
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'Ada Lovelace' }],
      });
      expect(doc.content[1]).toMatchObject({
        type: 'paragraph',
        content: [{ type: 'text', text: 'ada@example.com' }],
      });
      expect(doc.content[2]).toMatchObject({ content: [{ text: 'Summary' }] });
      expect(out.plainText.startsWith('Ada Lovelace\nada@example.com\n')).toBe(true);
    });

    it('adds no header without a contact', () => {
      const doc = parse(resumeToTiptapDoc(RESUME).contentJson);

      expect(doc.content[0]).toMatchObject({ content: [{ text: 'Summary' }] });
    });

    it('keeps the email line and drops the heading when the user has no name', () => {
      const out = resumeToTiptapDoc(RESUME, { ...CONTACT, name: null });
      const doc = parse(out.contentJson);

      expect(doc.content[0]).toMatchObject({
        type: 'paragraph',
        content: [{ text: 'ada@example.com' }],
      });
      expect(out.plainText.startsWith('ada@example.com')).toBe(true);
    });

    it('treats a blank name as no name and never emits an empty text node', () => {
      const out = resumeToTiptapDoc(RESUME, { name: '   ', email: null, details: [] });

      expect(out.contentJson).not.toContain('"text":""');
      expect(parse(out.contentJson).content[0]).toMatchObject({ content: [{ text: 'Summary' }] });
    });

    it('joins extra detail lines to the email with a separator', () => {
      const out = resumeToTiptapDoc(RESUME, { ...CONTACT, details: ['London'] });

      expect(out.plainText).toContain('ada@example.com | London');
    });

    it('lets the ATS email check pass on a generated resume', () => {
      const without = scoreResumeText(resumeToTiptapDoc(RESUME).plainText);
      const withHeader = scoreResumeText(resumeToTiptapDoc(RESUME, CONTACT).plainText);

      expect(without.checks.find((c) => c.id === 'email')?.passed).toBe(false);
      expect(withHeader.checks.find((c) => c.id === 'email')?.passed).toBe(true);
    });
  });
});
