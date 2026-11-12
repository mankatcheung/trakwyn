import { runCase } from '#src/evals/runCase.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type { CaseResult, EvalCase } from '#src/evals/types.js';

/**
 * One at a time, on purpose: a burst of twenty parallel requests is the quick
 * way to hit a provider's rate limit and fail cases for a reason that says
 * nothing about the prompt.
 *
 * It stops at the first case that hit the provider's daily quota (JEF-556):
 * every later call would fail the same way until the allocation resets. The
 * cases not run are the ones missing from the returned list.
 */
export async function runSuite(
  provider: ILLMProvider,
  cases: EvalCase[],
  onResult?: (result: CaseResult) => void,
  judge?: ILLMProvider,
): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const evalCase of cases) {
    const result = await runCase(evalCase, provider, judge);
    results.push(result);
    onResult?.(result);
    if (result.quotaStop) break;
  }
  return results;
}
