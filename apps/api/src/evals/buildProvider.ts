import { PROVIDER_REGISTRY } from '#src/infrastructure/llm/providerRegistry.js';
import { OpenAICompatibleLLMProvider } from '#src/infrastructure/llm/OpenAICompatibleLLMProvider.js';
import { workersAiReasoningFields } from '#src/infrastructure/llm/workersAiReasoning.js';
import { OutboundUrlPolicy } from '#src/infrastructure/net/OutboundUrlPolicy.js';
import { cachingProvider } from '#src/evals/responseCache.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import { createClaudeCodeProvider, claudeCodeSettings } from '#src/evals/claudeCodeProvider.js';
import { CLAUDE_CODE_PROVIDER, WORKERS_AI_PROVIDER, type EvalTarget } from '#src/evals/types.js';

export const targetLabel = (target: EvalTarget): string =>
  `${target.provider}:${target.model ?? 'default'}`;

/**
 * The same adapter a user's saved key would get (retries, JSON mode, usage
 * parsing and all), built straight from the registry because there is no user
 * or database here. A custom base URL still goes through the outbound URL
 * policy, which is strict only in production, so a local model on localhost
 * works for the person running this.
 */
export function buildProvider(
  target: EvalTarget,
  cache: { dir: string; refresh: boolean; onLookup?: (hit: boolean) => void } | null,
): ILLMProvider {
  const provider = buildUncached(target);

  return cache ? cachingProvider(provider, { ...cache, namespace: targetLabel(target) }) : provider;
}

/**
 * `workersai` mirrors `PlatformLLMProviderFactory`, so a use case's
 * `reasoning: 'off'` reaches the model as it does in production; through
 * `custom` that setting is dropped. No gateway headers: the eval measures the
 * model and should not add to production analytics.
 */
function buildWorkersAi(target: EvalTarget): ILLMProvider {
  if (!target.model || !target.baseUrl) {
    throw new Error('The workersai provider requires a model and an endpoint');
  }
  return new OpenAICompatibleLLMProvider(
    target.apiKey,
    target.baseUrl,
    target.model,
    undefined,
    {},
    workersAiReasoningFields(target.model),
  );
}

function buildUncached(target: EvalTarget): ILLMProvider {
  if (target.provider === CLAUDE_CODE_PROVIDER) {
    return createClaudeCodeProvider({ model: target.model, ...claudeCodeSettings(process.env) });
  }
  if (target.provider === WORKERS_AI_PROVIDER) return buildWorkersAi(target);

  const entry = PROVIDER_REGISTRY[target.provider];
  if (!entry) {
    throw new Error(`No provider named "${target.provider}"`);
  }
  return entry.create({
    apiKey: target.apiKey,
    model: target.model,
    baseUrl: target.baseUrl,
    outboundUrlPolicy: new OutboundUrlPolicy(),
  });
}
