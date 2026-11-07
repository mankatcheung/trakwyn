import { describe, expect, it, vi } from 'vitest';
import { GENERATION_CASES } from '#src/evals/cases/generation.js';
import { generationCase } from '#src/evals/cases/builders.js';
import { claimSource } from '#src/evals/fixtures/generationFixture.js';
import { GENERATION_FIXTURES, THIN_PROFILE } from '#src/evals/fixtures/profiles.js';
import { runCase } from '#src/evals/runCase.js';
import { makeLLMProvider } from '#src/__tests__/helpers/mocks/llm.js';
import { judgeSaying, supportedClaimsJudge } from '#src/__tests__/evals/judgeHelpers.js';

const resumeCase = GENERATION_CASES.find((c) => c.id === 'resume-thin-profile')!;
const letterCase = GENERATION_CASES.find((c) => c.id === 'cover-letter-thin-profile')!;

describe('the generation cases', () => {
  it('has at least eight, covering both features and the awkward profiles', () => {
    const ids = GENERATION_CASES.map((c) => c.id);

    expect(GENERATION_CASES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(GENERATION_CASES.map((c) => c.feature))).toEqual(
      new Set(['resume', 'coverLetter']),
    );
    expect(ids).toEqual(expect.arrayContaining(['resume-thin-profile', 'resume-empty-skills']));
    expect(ids.some((id) => id.includes('injection'))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every fixture a profile with something to write from', () => {
    for (const fixture of GENERATION_FIXTURES) {
      expect(fixture.workExperiences.length + fixture.educations.length).toBeGreaterThan(0);
    }
    expect(THIN_PROFILE.educations).toEqual([]);
  });

  it('puts the posting and notes in the text the judge checks against', () => {
    const injected = GENERATION_FIXTURES.find((f) => f.id === 'injection-in-note')!;

    expect(claimSource(injected)).toContain('PhD from MIT');
    expect(claimSource(injected)).toContain(injected.app.company);
  });
});

describe.each(GENERATION_CASES)('generation case $id', (evalCase) => {
  it('fails and names the claim when the judge finds an unsupported one', async () => {
    const judge = judgeSaying([
      { text: 'Led a team of 10', supported: false, evidence: 'source says 4' },
      { text: 'Worked at Lumen Freight', supported: true, evidence: '' },
    ]);

    const failures = await evalCase.run(makeLLMProvider(evalCase.idealReply), judge);

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('Led a team of 10');
    expect(failures[0]).toContain('source says 4');
  });

  it('fails when the judge extracts no claims, since nothing was verified', async () => {
    const failures = await evalCase.run(makeLLMProvider(evalCase.idealReply), judgeSaying([]));

    expect(failures).toEqual([expect.stringContaining('no claims')]);
  });

  it('refuses to run without a judge', async () => {
    await expect(evalCase.run(makeLLMProvider(evalCase.idealReply))).rejects.toThrow(/judge/);
  });
});

describe('generationCase', () => {
  it('sends the judge the output it graded and the fixture it was written from', async () => {
    const judge = supportedClaimsJudge();

    await letterCase.run(makeLLMProvider('I worked at Corner Cafe.'), judge);

    const [messages] = vi.mocked(judge.complete).mock.calls[0]!;
    const sent = messages.map((m) => m.content).join('\n');
    expect(sent).toContain('I worked at Corner Cafe.');
    expect(sent).toContain('Corner Cafe');
    expect(sent).toContain('Fenwick & Co');
  });

  it('fails a resume that names an employer the user never entered, before the judge sees it', async () => {
    const invented = JSON.stringify({
      ...THIN_PROFILE.idealResume,
      experience: [{ company: 'Google', title: 'Staff Engineer', bullets: [] }],
    });
    const judge = supportedClaimsJudge();

    const result = await runCase(resumeCase, makeLLMProvider(invented), judge);

    expect(result.passed).toBe(false);
    expect(result.schemaValid).toBe(false);
    expect(judge.complete).not.toHaveBeenCalled();
  });

  it('records the judge tokens apart from the target tokens', async () => {
    const target = makeLLMProvider(resumeCase.idealReply);
    vi.mocked(target.complete).mockResolvedValue({
      content: resumeCase.idealReply,
      usage: { promptTokens: 40, completionTokens: 10 },
    });
    const judge = supportedClaimsJudge();
    vi.mocked(judge.complete).mockResolvedValue({
      content: JSON.stringify({ claims: [{ text: 'x', supported: true }] }),
      usage: { promptTokens: 700, completionTokens: 90 },
    });

    const result = await runCase(resumeCase, target, judge);

    expect(result).toMatchObject({
      passed: true,
      promptTokens: 40,
      completionTokens: 10,
      judgePromptTokens: 700,
      judgeCompletionTokens: 90,
    });
  });

  it('throws an unreadable judge reply, which runCase reports as a failed case', async () => {
    const result = await runCase(
      generationCase({ id: 'x', feature: 'coverLetter', fixture: THIN_PROFILE }),
      makeLLMProvider('A letter.'),
      makeLLMProvider('not json'),
    );

    expect(result.passed).toBe(false);
    expect(result.schemaValid).toBe(false);
  });
});
