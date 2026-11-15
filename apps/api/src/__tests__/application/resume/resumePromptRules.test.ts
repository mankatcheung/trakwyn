import { describe, expect, it } from 'vitest';
import { resumePrompt } from '#src/use-cases/prompts/resume.js';

const system = (): string => {
  const [message] = resumePrompt.build({
    app: { company: 'Acme', role: 'Engineer' },
    profileText: 'Engineer at Acme',
    applicationContext: '',
    crossApplicationContext: '',
    customAiPrompt: null,
  });
  return message!.content as string;
};

/**
 * The resume prompt grew a section on writing for a recruiter's first skim
 * (JEF-596). The facts a resume may state are the part that must never be
 * edited away while the style guidance changes, so each rule is pinned here by
 * the words that carry it, apart from the snapshot that pins the whole text.
 */
describe('resume prompt rules', () => {
  it('keeps every truthfulness rule', () => {
    const text = system();

    expect(text).toContain(
      'Never invent an employer, job title, institution, qualification, date, skill or achievement',
    );
    expect(text).toContain('Every company and institution you name must be one that appears');
    expect(text).toContain('Never inflate seniority or exaggerate scope');
    expect(text).toContain('If the background is thin, produce a short resume');
    expect(text).toContain('If a role has no description, write no bullets for it');
    expect(text).toContain(
      'Do not write a name, email address, phone number or other contact line',
    );
    expect(text).toContain('never claim it, and never add it to the skills');
  });

  it('never lets the style guidance add a number, a skill or a related skill', () => {
    const text = system();

    expect(text).toContain(
      'Keep every number, scale and named tool exactly as the background gives it, and never add one',
    );
    expect(text).toContain('Only for the same skill, never a related one');
    // The rule that tells the model to prefer the posting's wording must not tell it to add skills.
    expect(text).not.toMatch(/add (any |the )?(missing )?(skill|keyword)s? (from|that)/i);
  });

  it('asks for a summary aimed at the role, action-led bullets, and the best match first', () => {
    const text = system();

    expect(text).toContain("Writing for a recruiter's first skim");
    expect(text).toContain('Open with the role the candidate is applying for');
    expect(text).toContain('start each with a strong action verb');
    expect(text).toContain('Put the bullet that best matches the posting first in each role');
    expect(text).toContain('Order the skill groups');
  });

  it('gives recent roles more room than old ones, and asks for about a page', () => {
    const text = system();

    expect(text).toContain('up to five bullets');
    expect(text).toContain('Give an older or unrelated role one or two, or none');
    expect(text).toContain('about 400 words');
    expect(text).toContain('two pages at most');
  });

  it('still returns the same JSON shape', () => {
    expect(system()).toContain(
      '{"summary":string,"experience":[{"company":string,"title":string,"period":string,"bullets":[string]}],"education":[{"institution":string,"qualification":string,"period":string}],"skills":[{"category":string,"items":[string]}]}',
    );
  });
});
