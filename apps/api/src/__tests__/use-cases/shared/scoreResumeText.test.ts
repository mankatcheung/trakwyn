import { describe, it, expect } from 'vitest';
import { scoreResumeText } from '#src/use-cases/shared/scoreResumeText.js';
import { ATS_SCORE } from '#src/use-cases/constants.js';

const FILLER = 'Collaborated with product and design to ship reliable features for customers. ';

/** A resume that passes every check; `without` drops the named line(s) and `extra` appends text. */
function resume({ drop = [] as string[], extra = '', filler = 26 } = {}): string {
  const lines = [
    'Jane Doe',
    'jane.doe@example.com',
    '+1 415 555 0134',
    '## Summary',
    FILLER.repeat(filler),
    '## Work Experience',
    'Senior Engineer, Acme — Jan 2021 – Present',
    '- Cut page load time by 40% across the checkout flow',
    '- Led a team of 6 engineers to ship 12 releases',
    '- Reduced infrastructure cost by $120k a year',
    'Engineer, Globex — 2017 – 2020',
    '- Built the billing service used by 3 products',
    '## Education',
    'BSc Computer Science, State University — 2013 – 2017',
    '## Technical Skills',
    'TypeScript, GraphQL, PostgreSQL, Kubernetes',
  ];
  return [...lines.filter((l) => !drop.some((d) => l.includes(d))), extra].join('\n');
}

const failedIds = (text: string) =>
  scoreResumeText(text)
    .checks.filter((c) => !c.passed)
    .map((c) => c.id);

describe('scoreResumeText', () => {
  it('weights add up to the maximum score', () => {
    const total = Object.values(ATS_SCORE.WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBe(ATS_SCORE.MAX_SCORE);
  });

  it('scores a well-formed resume 100 with every check passing', () => {
    const result = scoreResumeText(resume());
    expect(failedIds(resume())).toEqual([]);
    expect(result).toMatchObject({ score: 100, label: 'Excellent', readable: true });
    expect(result.checks.map((c) => c.points).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('gives the same score for the same text every time', () => {
    expect(scoreResumeText(resume())).toEqual(scoreResumeText(resume()));
  });

  it.each([
    ['empty text', ''],
    ['whitespace only', '  \n\t  \n'],
    ['stray scan noise', 'l i 1 |'],
  ])('reports %s as not readable, scoring 0 with no other checks', (_label, text) => {
    expect(scoreResumeText(text)).toEqual({
      score: 0,
      label: 'Not readable by an ATS',
      readable: false,
      checks: [expect.objectContaining({ id: 'text_extracted', passed: false })],
    });
  });

  describe('each check fails on its own', () => {
    it.each([
      ['email', 'jane.doe@example.com', ['email']],
      ['phone', '+1 415 555 0134', ['phone']],
      ['experience_heading', '## Work Experience', ['experience_heading']],
      ['education_heading', '## Education', ['education_heading']],
      ['skills_heading', '## Technical Skills', ['skills_heading']],
    ])('%s', (_id, removed, expected) => {
      const text = resume({ drop: [removed] });
      expect(failedIds(text)).toEqual(expected);
      expect(scoreResumeText(text).score).toBeLessThan(100);
    });

    it('dates', () => {
      const text = resume({ drop: ['Jan 2021', '2017 – 2020', '2013 – 2017'] });
      expect(failedIds(text)).toEqual(['dates']);
    });

    it('bullets (and the numbers in them)', () => {
      const text = resume({ drop: ['- '] });
      expect(failedIds(text)).toEqual(['bullets', 'quantified_results']);
    });

    it('quantified results, when bullets have no numbers', () => {
      const text = resume({
        drop: ['- Cut', '- Led', '- Reduced'],
        extra: '- Built things\n- Ran things\n- Fixed things',
      });
      expect(failedIds(text)).toEqual(['quantified_results']);
    });

    it('length, when too short', () => {
      expect(failedIds(resume({ filler: 8 }))).toEqual(['length']);
    });

    it('length, when too long', () => {
      expect(failedIds(resume({ filler: 120 }))).toEqual(['length']);
    });

    it('clean characters, when emoji litter the text', () => {
      expect(failedIds(resume({ extra: '🚀 ⭐ 🔥 💡 ✨ 🎯 📈' }))).toEqual(['clean_characters']);
    });

    it('clean characters, when lines are mostly symbols', () => {
      const noise = '★ ☆ ★ ☆ ★ ☆ ★ ☆ a';
      expect(failedIds(resume({ extra: [noise, noise, noise].join('\n') }))).toEqual([
        'clean_characters',
      ]);
    });
  });

  describe('matching', () => {
    it.each([
      'EXPERIENCE',
      'Professional Experience:',
      '**Work Experience**',
      '## Employment History',
      'Work  History',
    ])('accepts the heading %j', (heading) => {
      expect(failedIds(resume({ drop: ['## Work Experience'], extra: heading }))).not.toContain(
        'experience_heading',
      );
    });

    it('accepts Education & Training and Core Competencies as headings', () => {
      const text =
        resume({ drop: ['## Education', '## Technical Skills'] }) +
        '\nEducation & Training\nCore Competencies';
      expect(failedIds(text)).toEqual([]);
    });

    it('does not take a sentence mentioning experience for a heading', () => {
      const text = resume({
        drop: ['## Work Experience'],
        extra: 'I have experience in many things',
      });
      expect(failedIds(text)).toContain('experience_heading');
    });

    it('does not take a year range for a phone number', () => {
      const text = resume({ drop: ['+1 415 555 0134'] });
      expect(failedIds(text)).toEqual(['phone']);
    });

    it.each(['(415) 555-0134', '415.555.0134', '+44 20 7946 0958'])(
      'accepts the phone number %s',
      (phone) => {
        const text = resume({ drop: ['+1 415 555 0134'], extra: phone });
        expect(failedIds(text)).not.toContain('phone');
      },
    );

    it('does not count a date in a bullet as a quantified result', () => {
      const text = resume({
        drop: ['- Cut', '- Led', '- Reduced', '- Built'],
        extra: '- Worked there Jan 2020 - Mar 2021\n- Joined in 2019\n- Left in June 2022',
      });
      expect(failedIds(text)).toContain('quantified_results');
    });

    it('reads Markdown from a converted PDF and numbered lists as bullets', () => {
      const text = resume({
        drop: ['- '],
        extra: '1. Cut load time by 40%\n2) Shipped 12 releases\n- Saved 3 hours a week',
      });
      expect(failedIds(text)).toEqual([]);
    });
  });

  describe('labels', () => {
    it.each([
      [100, 'Excellent'],
      [75, 'Good'],
      [49, 'Fair'],
      [27, 'Needs work'],
    ])('a resume scoring about %i is labelled %s', (target, label) => {
      const drops: Record<number, string[]> = {
        100: [],
        75: ['jane.doe@example.com', '+1 415 555 0134', '## Education'],
        49: [
          'jane.doe@example.com',
          '+1 415 555 0134',
          '## Education',
          '## Technical Skills',
          '## Work Experience',
        ],
        27: [
          'jane.doe@example.com',
          '+1 415 555 0134',
          '## Education',
          '## Technical Skills',
          '## Work Experience',
          'Jan 2021',
          '2017 – 2020',
          '2013 – 2017',
          '- ',
        ],
      };
      const result = scoreResumeText(resume({ drop: drops[target] }));
      expect(result.label).toBe(label);
    });
  });
});
