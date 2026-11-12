import { AiResponseInvalidError, LlmProviderError } from '#src/use-cases/errors/DomainError.js';
import { isLeakedToolCallError } from '#src/infrastructure/llm/leakedToolCall.js';
import { isQuotaStop } from '#src/evals/quotaStop.js';
import { promptRefOf } from '#src/evals/promptRef.js';
import { meterProvider } from '#src/evals/usageMeter.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type { CaseOutcome, CaseResult, EvalCase } from '#src/evals/types.js';

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
 * unparseable reply ends that case and the run goes on, since the point is
 * to see how many of the rest the model gets right. A thrown error is the
 * model's (`fail`) when the reply was unreadable or a tool call leaked, and
 * the provider's (`error`) otherwise, including a judge's (JEF-559).
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
  let quotaStop = false;
  let thrownOutcome: CaseOutcome | null = null;

  try {
    failures = await evalCase.run(meter.provider, judgeMeter?.provider);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof AiResponseInvalidError) {
      schemaValid = false;
      thrownOutcome = 'fail';
      failures = [`reply was not valid: ${message}`];
    } else if (error instanceof LlmProviderError) {
      quotaStop = isQuotaStop(error);
      // A leaked tool call is thrown as a provider error so failover can act on
      // it, but it is the model misbehaving, which is what the user would see.
      thrownOutcome = isLeakedToolCallError(error) ? 'fail' : 'error';
      failures = [`error: ${message}${providerDetail(error)}`];
    } else {
      thrownOutcome = 'error';
      failures = [`error: ${message}`];
    }
  }
  const outcome: CaseOutcome = thrownOutcome ?? (failures.length === 0 ? 'pass' : 'fail');

  const { promptTokens, completionTokens, latencyMs, streams, toolCalls } = meter.totals();
  const judged = judgeMeter?.totals();
  return {
    caseId: evalCase.id,
    feature: evalCase.feature,
    prompt: promptRefOf(evalCase.feature),
    outcome,
    passed: outcome === 'pass',
    schemaValid,
    failures,
    ...(quotaStop ? { quotaStop } : {}),
    promptTokens,
    completionTokens,
    judgePromptTokens: judged?.promptTokens ?? 0,
    judgeCompletionTokens: judged?.completionTokens ?? 0,
    latencyMs,
    toolCalls,
    iterations: streams,
    calls: meter.calls(),
    judgeCalls: judgeMeter?.calls() ?? [],
  };
}
