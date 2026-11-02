import { LLM_PRICES, type LlmPrice } from '#src/infrastructure/config/constants.js';
import { LLM, LLM_PROVIDER } from '#src/use-cases/constants.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { LLMUsage } from '#src/use-cases/ports/ILLMProvider.js';

const TOKENS_PER_PRICE_UNIT = 1_000_000;

/** What a provider runs when the user's key names no model; mirrors `PROVIDER_REGISTRY`. */
const DEFAULT_MODEL: Readonly<Record<string, string>> = {
  [LLM_PROVIDER.OPENAI]: LLM.OPENAI_DEFAULT_MODEL,
  [LLM_PROVIDER.ANTHROPIC]: LLM.ANTHROPIC_DEFAULT_MODEL,
  [LLM_PROVIDER.GOOGLEAI]: LLM.GOOGLEAI_DEFAULT_MODEL,
  [LLM_PROVIDER.OPENROUTER]: LLM.OPENROUTER_DEFAULT_MODEL,
  [LLM_PROVIDER.MISTRAL]: LLM.MISTRAL_DEFAULT_MODEL,
  [LLM_PROVIDER.GROQ]: LLM.GROQ_DEFAULT_MODEL,
  [LLM_PROVIDER.XAI]: LLM.XAI_DEFAULT_MODEL,
  [LLM_PROVIDER.DEEPSEEK]: LLM.DEEPSEEK_DEFAULT_MODEL,
  [LLM_PROVIDER.NVIDIA]: LLM.NVIDIA_DEFAULT_MODEL,
};

export function findLlmPrice(provider: string, model: string | null): LlmPrice | null {
  const resolvedModel = model ?? DEFAULT_MODEL[provider];
  if (!resolvedModel) return null;
  return LLM_PRICES[provider]?.[resolvedModel] ?? null;
}

/**
 * The cost of one call in micro-USD, rounded to a whole number, or `null`
 * when the model has no price (JEF-444). `promptTokens` is the total billed
 * input with cache reads and writes folded in (see `LLMUsage`), so the
 * uncached part is what is left after taking those out; a model with no
 * cache price bills cached tokens as plain input.
 *
 * Pure: the once-per-model warning for a missing price is
 * `warnPriceUnknownOnce`, which the caller invokes.
 */
export function estimateCostMicros(
  usage: LLMUsage,
  provider: string,
  model: string | null,
): number | null {
  const price = findLlmPrice(provider, model);
  if (!price) return null;

  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const uncached = Math.max(0, usage.promptTokens - cacheRead - cacheWrite);

  const perMillion =
    uncached * price.input +
    cacheRead * (price.cachedInput ?? price.input) +
    cacheWrite * (price.cacheWrite ?? price.input) +
    usage.completionTokens * price.output;
  return Math.round(perMillion / TOKENS_PER_PRICE_UNIT);
}

const warnedUnpriced = new Set<string>();

/**
 * Logs `llm.price_unknown` once per provider and model for the life of the
 * process. Module state rather than an instance, because the usage-tracking
 * wrapper that calls it is built afresh for every AI call.
 */
export function warnPriceUnknownOnce(
  logger: ILogger,
  provider: string,
  model: string | null,
): void {
  const key = `${provider}/${model ?? 'default'}`;
  if (warnedUnpriced.has(key)) return;
  warnedUnpriced.add(key);
  logger.warn('llm.price_unknown', undefined, { event: 'llm.price_unknown', provider, model });
}

/** Test seam: forget which models were already warned about. */
export function resetPriceUnknownWarnings(): void {
  warnedUnpriced.clear();
}
