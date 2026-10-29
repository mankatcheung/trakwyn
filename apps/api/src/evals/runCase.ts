import { AiResponseInvalidError } from '#src/use-cases/errors/DomainError.js';
import { meterProvider } from '#src/evals/usageMeter.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type { CaseResult, EvalCase } from '#src/evals/types.js';

/**
 * Runs one case and always returns a result: a provider outage or an
 * unparseable reply fails that case and the run goes on, since the point is
 * to see how many of the rest the model gets right.
 */
export async function runCase(evalCase: EvalCase, provider: ILLMProvider): Promise<CaseResult> {
  const meter = meterProvider(provider);
  let failures: string[];
  let schemaValid = true;

  try {
    failures = await evalCase.run(meter.provider);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof AiResponseInvalidError) {
      schemaValid = false;
      failures = [`reply was not valid: ${message}`];
    } else {
      failures = [`error: ${message}`];
    }
  }

  const { promptTokens, completionTokens, latencyMs } = meter.totals();
  return {
    caseId: evalCase.id,
    feature: evalCase.feature,
    passed: failures.length === 0,
    schemaValid,
    failures,
    promptTokens,
    completionTokens,
    latencyMs,
  };
}
