import { generationCase } from '#src/evals/cases/builders.js';
import { GENERATION_FIXTURES } from '#src/evals/fixtures/profiles.js';
import { RESUME_QUALITY_FIXTURES } from '#src/evals/fixtures/qualityProfiles.js';
import type { EvalCase } from '#src/evals/types.js';

/**
 * A resume and a cover letter for each fixture, graded for invented content,
 * then a resume alone for each of the fixtures made to be judged for quality
 * (JEF-599). Every resume case is also scored for quality.
 */
export const GENERATION_CASES: EvalCase[] = [
  ...GENERATION_FIXTURES.flatMap((fixture) => [
    generationCase({ id: `resume-${fixture.id}`, feature: 'resume', fixture }),
    generationCase({ id: `cover-letter-${fixture.id}`, feature: 'coverLetter', fixture }),
  ]),
  ...RESUME_QUALITY_FIXTURES.map((fixture) =>
    generationCase({ id: `resume-${fixture.id}`, feature: 'resume', fixture }),
  ),
];
