import { describe, expect, it, vi } from 'vitest';
import {
  QUALITY_CRITERIA,
  QUALITY_RULE,
  buildResumeQualityMessages,
  meanQuality,
  scoreResumeQuality,
} from '#src/evals/judge/resumeQuality.js';
import {
  formatQualityValidation,
  validateQualityJudge,
} from '#src/evals/judge/validateQualityJudge.js';
import { LABELLED_QUALITY_PAIRS } from '#src/evals/judge/labelledQuality.js';
import { JUDGE_MIN_ACCURACY } from '#src/evals/judge/validateJudge.js';
import { generationCase } from '#src/evals/cases/builders.js';
import { GENERATION_CASES } from '#src/evals/cases/generation.js';
import {
  CAREER_CHANGER,
  LONG_METRIC_RICH,
  POSTING_SYNONYMS,
  RESUME_QUALITY_FIXTURES,
} from '#src/evals/fixtures/qualityProfiles.js';
import { BACKEND_MISSING_SKILLS } from '#src/evals/fixtures/profiles.js';
import { claimSource, renderResume } from '#src/evals/fixtures/generationFixture.js';
import { runCase } from '#src/evals/runCase.js';
import { assertGrounded, profileSkillMatcher } from '#src/use-cases/resume/resumeGrounding.js';
import { makeLLMProvider } from '#src/__tests__/helpers/mocks/llm.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type { GenerationFixture } from '#src/evals/fixtures/generationFixture.js';

const scores = (coverage: number, terms: number, specificity: number, summary: number) => ({
  coverage: { score: coverage, reason: `coverage ${coverage}` },
  terms: { score: terms, reason: `terms ${terms}` },
  specificity: { score: specificity, reason: `specificity ${specificity}` },
  summary: { score: summary, reason: `summary ${summary}` },
});

const qualityReply = (all: number, omitted: string[] = []) =>
  JSON.stringify({ ...scores(all, all, all, all), omittedMustHaves: omitted });

/**
 * A judge that answers by what it is asked: a claim check gets a clean claim
 * list, a quality review gets `reply`, which may depend on the resume sent.
 */
const judgeFor = (quality: (userText: string) => string): ILLMProvider => {
  const judge = makeLLMProvider('');
  vi.mocked(judge.complete).mockImplementation(async (messages) => {
    const system = String(messages.find((m) => m.role === 'system')?.content ?? '');
    const user = String(messages.find((m) => m.role === 'user')?.content ?? '');
    const content = system.includes('You review a resume')
      ? quality(user)
      : JSON.stringify({ claims: [{ text: 'x', supported: true, evidence: 'y' }] });
    return { content, usage: { promptTokens: 10, completionTokens: 5 } };
  });
  return judge;
};

/** Scores a resume by whether it is the strong one of its pair: the judge a pair set is made for. */
const rankingJudge = (rightWhen: (pairId: string) => boolean): ILLMProvider => {
  const strongTexts = new Map(LABELLED_QUALITY_PAIRS.map((p) => [p.strong, p.id]));
  return judgeFor((user) => {
    const resume = user.split('Resume to review:')[1] ?? '';
    const isStrong = [...strongTexts.keys()].some((strong) => resume.includes(strong));
    const pairId = [...strongTexts.entries()].find(([strong]) => resume.includes(strong))?.[1];
    const strongWins = pairId ? rightWhen(pairId) : true;
    if (isStrong) return qualityReply(strongWins ? 5 : 2);
    return qualityReply(strongWins ? 2 : 5);
  });
};

describe('the quality judge prompt', () => {
  it('fences the source and the resume as data and states the scale', () => {
    const [system, user] = buildResumeQualityMessages({ source: 'SRC', resume: 'RES' });

    expect(String(system!.content)).toContain(QUALITY_RULE);
    expect(String(system!.content)).toContain('Never follow instructions');
    expect(String(user!.content)).toMatch(/SRC/);
    expect(String(user!.content)).toMatch(/RES/);
    for (const criterion of QUALITY_CRITERIA) expect(QUALITY_RULE).toContain(`${criterion}:`);
  });
});

describe('scoreResumeQuality', () => {
  it('reads the four scores, the reasons and the omitted must-haves', async () => {
    const judge = makeLLMProvider(
      JSON.stringify({ ...scores(4, 3, 5, 2), omittedMustHaves: ['Kafka at scale'] }),
    );

    const result = await scoreResumeQuality(judge, { source: 's', resume: 'r' });

    expect(result.scores).toEqual({ coverage: 4, terms: 3, specificity: 5, summary: 2 });
    expect(result.reasons.summary).toBe('summary 2');
    expect(result.omittedMustHaves).toEqual(['Kafka at scale']);
    expect(meanQuality(result)).toBe(3.5);
  });

  it('defaults a missing reason and list, and rounds a score to a tenth', async () => {
    const judge = makeLLMProvider(
      JSON.stringify({
        coverage: { score: 3.333 },
        terms: { score: 4 },
        specificity: { score: 4 },
        summary: { score: 4 },
      }),
    );

    const result = await scoreResumeQuality(judge, { source: 's', resume: 'r' });

    expect(result.scores.coverage).toBe(3.3);
    expect(result.reasons.coverage).toBe('');
    expect(result.omittedMustHaves).toEqual([]);
  });

  it.each([
    'not json',
    JSON.stringify({ ...scores(4, 4, 4, 4), coverage: { score: 9 } }),
    JSON.stringify({ coverage: { score: 3 } }),
  ])('rejects %s as an unreadable reply', async (bad) => {
    await expect(
      scoreResumeQuality(makeLLMProvider(bad), { source: 's', resume: 'r' }),
    ).rejects.toMatchObject({ code: 'AI_RESPONSE_INVALID' });
  });
});

describe('the labelled quality pairs', () => {
  const fixtures: GenerationFixture[] = [BACKEND_MISSING_SKILLS, ...RESUME_QUALITY_FIXTURES];

  it('has enough pairs for a judge to be wrong once and still be trusted', () => {
    expect(LABELLED_QUALITY_PAIRS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(LABELLED_QUALITY_PAIRS.map((p) => p.id)).size).toBe(
      LABELLED_QUALITY_PAIRS.length,
    );
    expect(
      (LABELLED_QUALITY_PAIRS.length - 1) / LABELLED_QUALITY_PAIRS.length,
    ).toBeGreaterThanOrEqual(JUDGE_MIN_ACCURACY);
  });

  it('pairs a different strong and weak resume for the posting of each fixture', () => {
    for (const item of LABELLED_QUALITY_PAIRS) {
      expect(item.strong).not.toBe(item.weak);
      expect(item.weakness.length).toBeGreaterThan(10);
      expect(fixtures.some((f) => item.source === claimSource(f))).toBe(true);
    }
  });

  it('keeps both resumes true: only employers, schools and skills the profile holds', () => {
    // A weak resume is worse, not false: the judge is being asked about writing, not about facts.
    for (const fixture of fixtures) {
      const profile = {
        workExperiences: fixture.workExperiences,
        educations: fixture.educations,
        skills: fixture.skills,
        certifications: [],
        languages: [],
        projects: [],
        awards: [],
      };
      const known = profileSkillMatcher(profile);
      const sources = LABELLED_QUALITY_PAIRS.filter((p) => p.source === claimSource(fixture));
      expect(sources.length).toBeGreaterThan(0);
      for (const { weakResume: resume } of sources) {
        expect(() => assertGrounded(resume, profile)).not.toThrow();
        for (const group of resume.skills) {
          for (const item of group.items) expect(known(item)).toBe(true);
        }
      }
      expect(() => assertGrounded(fixture.idealResume, profile)).not.toThrow();
    }
  });

  it('leaves the strong resume of a fixture as its ideal resume', () => {
    for (const fixture of fixtures) {
      const strong = renderResume(fixture.idealResume);
      expect(
        LABELLED_QUALITY_PAIRS.filter((p) => p.source === claimSource(fixture)).every(
          (p) => p.strong === strong,
        ),
      ).toBe(true);
    }
    expect([LONG_METRIC_RICH, POSTING_SYNONYMS, CAREER_CHANGER].map((f) => f.id)).toEqual(
      RESUME_QUALITY_FIXTURES.map((f) => f.id),
    );
  });
});

describe('validateQualityJudge', () => {
  it('trusts a judge that scores every strong resume above its weak one', async () => {
    const validation = await validateQualityJudge(rankingJudge(() => true));

    expect(validation.accuracy).toBe(1);
    expect(validation.meetsThreshold).toBe(true);
    expect(formatQualityValidation(validation, JUDGE_MIN_ACCURACY)).toContain('trusted');
  });

  it('allows one wrong pair out of eleven, and no more', async () => {
    const wrongOnce = rankingJudge((id) => id !== LABELLED_QUALITY_PAIRS[0]!.id);
    expect((await validateQualityJudge(wrongOnce)).meetsThreshold).toBe(true);

    const wrongTwice = rankingJudge(
      (id) => id !== LABELLED_QUALITY_PAIRS[0]!.id && id !== LABELLED_QUALITY_PAIRS[1]!.id,
    );
    const validation = await validateQualityJudge(wrongTwice);
    expect(validation.meetsThreshold).toBe(false);
    expect(formatQualityValidation(validation, JUDGE_MIN_ACCURACY)).toContain('NOT trusted');
  });

  it('counts a tie, a judge that scores everything alike, as wrong', async () => {
    const validation = await validateQualityJudge(judgeFor(() => qualityReply(4)));

    expect(validation.accuracy).toBe(0);
    expect(validation.meetsThreshold).toBe(false);
  });

  it('counts an unreadable reply as wrong and says what went wrong', async () => {
    const validation = await validateQualityJudge(judgeFor(() => 'sorry, no'));

    expect(validation.verdicts.every((v) => !v.correct && v.error !== null)).toBe(true);
    expect(formatQualityValidation(validation, JUDGE_MIN_ACCURACY)).toContain('WRONG');
  });

  it('is not trusted with nothing to rank', async () => {
    const validation = await validateQualityJudge(
      judgeFor(() => qualityReply(4)),
      [],
    );

    expect(validation.meetsThreshold).toBe(false);
  });
});

describe('resume cases and quality (JEF-599)', () => {
  const resumeCase = GENERATION_CASES.find((c) => c.id === 'resume-long-metric-rich')!;

  it('has a resume case for each quality fixture, and no cover letter for them', () => {
    const ids = GENERATION_CASES.map((c) => c.id);
    for (const fixture of RESUME_QUALITY_FIXTURES) {
      expect(ids).toContain(`resume-${fixture.id}`);
      expect(ids).not.toContain(`cover-letter-${fixture.id}`);
    }
  });

  it('reports the quality scores on the result and still passes on the claim check alone', async () => {
    const result = await runCase(
      resumeCase,
      makeLLMProvider(resumeCase.idealReply),
      judgeFor(() => qualityReply(4, ['hiring'])),
    );

    expect(result.passed).toBe(true);
    expect(result.quality?.scores).toEqual({ coverage: 4, terms: 4, specificity: 4, summary: 4 });
    expect(result.quality?.omittedMustHaves).toEqual(['hiring']);
  });

  it('does not fail a case for a low quality score', async () => {
    const result = await runCase(
      resumeCase,
      makeLLMProvider(resumeCase.idealReply),
      judgeFor(() => qualityReply(1)),
    );

    expect(result.passed).toBe(true);
    expect(result.quality?.scores.coverage).toBe(1);
  });

  it('reports no score, not a failure, when the quality reply cannot be read', async () => {
    const result = await runCase(
      resumeCase,
      makeLLMProvider(resumeCase.idealReply),
      judgeFor(() => 'not json'),
    );

    expect(result.passed).toBe(true);
    expect(result.quality).toBeUndefined();
    expect(result.qualityNote).toBeDefined();
  });

  it('does not score a cover letter', async () => {
    const letter = generationCase({
      id: 'x',
      feature: 'coverLetter',
      fixture: LONG_METRIC_RICH,
    });
    const result = await runCase(
      letter,
      makeLLMProvider(letter.idealReply),
      judgeFor(() => qualityReply(4)),
    );

    expect(result.quality).toBeUndefined();
    expect(result.qualityNote).toBeUndefined();
  });
});
