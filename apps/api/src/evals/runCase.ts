import { AiResponseInvalidError, LlmProviderError } from '#src/use-cases/errors/DomainError.js';
import { promptRefOf } from '#src/evals/promptRef.js';
import { meterProvider } from '#src/evals/usageMeter.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type { CaseResult, EvalCase } from '#src/evals/types.js';

/**
 * What the provider said, which the user-facing message leaves out: "check the
 * model name" for a 400 sent one investigation the wrong way. The adapter has
 * already cut the body to a short excerpt. Eval reports only; the app's
 * messages are unchanged.
 */
function providerDetail(error: LlmProviderError): string {
  const status = error.status === null ? '' : `HTTP ${error.status}`;
  const body = error.detail === null ? '' : `body: ${error.detail}`;
  const parts = [status, body].filter((part) => part !== '');
  return parts.length === 0 ? '' : ` [${parts.join(', ')}]`;
}

/**
 * Runs one case and always returns a result: a provider outage or an
 * unparseable reply fails that case and the run goes on, since the point is
 * to see how many of the rest the model gets right.
 */
export async function runCase(
  evalCase: EvalCase,
  provider: ILLMProvider,
  judge?: ILLMProvider,
): Promise<CaseResult> {
  const meter = meterProvider(provider);
  const judgeMeter = judge ? meterProvider(judge) : null;
  let failures: string[];
  let schemaValid = true;

  try {
    failures = await evalCase.run(meter.provider, judgeMeter?.provider);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof AiResponseInvalidError) {
      schemaValid = false;
      failures = [`reply was not valid: ${message}`];
    } else if (error instanceof LlmProviderError) {
      failures = [`error: ${message}${providerDetail(error)}`];
    } else {
      failures = [`error: ${message}`];
    }
  }

  const { promptTokens, completionTokens, latencyMs, streams, toolCalls } = meter.totals();
  const judged = judgeMeter?.totals();
  return {
    caseId: evalCase.id,
    feature: evalCase.feature,
    prompt: promptRefOf(evalCase.feature),
    passed: failures.length === 0,
    schemaValid,
    failures,
    promptTokens,
    completionTokens,
    judgePromptTokens: judged?.promptTokens ?? 0,
    judgeCompletionTokens: judged?.completionTokens ?? 0,
    latencyMs,
    toolCalls,
    iterations: streams,
  };
}
