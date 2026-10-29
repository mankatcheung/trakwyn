import { runCase } from '#src/evals/runCase.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type { CaseResult, EvalCase } from '#src/evals/types.js';

/**
 * One at a time, on purpose: a burst of twenty parallel requests is the quick
 * way to hit a provider's rate limit and fail cases for a reason that says
 * nothing about the prompt.
 */
export async function runSuite(
  provider: ILLMProvider,
  cases: EvalCase[],
  onResult?: (result: CaseResult) => void,
): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const evalCase of cases) {
    const result = await runCase(evalCase, provider);
    results.push(result);
    onResult?.(result);
  }
  return results;
}
