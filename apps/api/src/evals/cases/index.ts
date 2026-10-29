import { JOB_DESCRIPTION_CASES } from '#src/evals/cases/jobDescription.js';
import { RESUME_MATCH_CASES } from '#src/evals/cases/resumeMatch.js';
import type { EvalCase } from '#src/evals/types.js';

export const ALL_CASES: EvalCase[] = [...JOB_DESCRIPTION_CASES, ...RESUME_MATCH_CASES];

/**
 * The cases named by `--case`, or all of them when none are. An id that
 * matches nothing throws, so a typo does not quietly run zero cases and
 * report a clean pass.
 */
export function selectCases(cases: EvalCase[], ids: string[]): EvalCase[] {
  if (ids.length === 0) return cases;

  const known = new Set(cases.map((evalCase) => evalCase.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown case ${unknown.join(', ')}; known cases: ${[...known].join(', ')}`);
  }
  return cases.filter((evalCase) => ids.includes(evalCase.id));
}
