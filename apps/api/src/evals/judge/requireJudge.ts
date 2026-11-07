import { needsJudge } from '#src/evals/cases/index.js';
import type { EvalCase, EvalConfig, EvalTarget } from '#src/evals/types.js';

/**
 * The judge a run will grade with, or a refusal to start. A run whose cases
 * include a graded feature and has no `EVAL_JUDGE_*` stops before the first
 * paid call, rather than grading with the model it is testing (JEF-470).
 */
export function requireJudge(config: EvalConfig, cases: EvalCase[]): EvalTarget | null {
  if (!needsJudge(cases)) return null;
  if (!config.judge) {
    throw new Error(
      'These cases are graded by a judge model: set EVAL_JUDGE_PROVIDER, EVAL_JUDGE_MODEL and EVAL_JUDGE_API_KEY, or leave them out with --case',
    );
  }
  return config.judge;
}
