import { PROVIDER_REGISTRY } from '#src/infrastructure/llm/providerRegistry.js';
import { OutboundUrlPolicy } from '#src/infrastructure/net/OutboundUrlPolicy.js';
import { cachingProvider } from '#src/evals/responseCache.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type { EvalTarget } from '#src/evals/types.js';

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
  cache: { dir: string; refresh: boolean } | null,
): ILLMProvider {
  const entry = PROVIDER_REGISTRY[target.provider];
  if (!entry) {
    throw new Error(`No provider named "${target.provider}"`);
  }

  const provider = entry.create({
    apiKey: target.apiKey,
    model: target.model,
    baseUrl: target.baseUrl,
    outboundUrlPolicy: new OutboundUrlPolicy(),
  });

  return cache ? cachingProvider(provider, { ...cache, namespace: targetLabel(target) }) : provider;
}
