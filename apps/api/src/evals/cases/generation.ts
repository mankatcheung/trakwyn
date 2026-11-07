import { generationCase } from '#src/evals/cases/builders.js';
import { GENERATION_FIXTURES } from '#src/evals/fixtures/profiles.js';
import type { EvalCase } from '#src/evals/types.js';

/** A resume and a cover letter for each fixture: ten cases graded for invented content. */
export const GENERATION_CASES: EvalCase[] = GENERATION_FIXTURES.flatMap((fixture) => [
  generationCase({ id: `resume-${fixture.id}`, feature: 'resume', fixture }),
  generationCase({ id: `cover-letter-${fixture.id}`, feature: 'coverLetter', fixture }),
]);
