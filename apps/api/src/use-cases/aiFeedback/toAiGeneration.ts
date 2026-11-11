import type { AiGeneration } from '#src/domain/aiFeedback/AiFeedback.js';
import type { LLMAnsweredBy } from '#src/use-cases/ports/ILLMProvider.js';

/**
 * The snapshot stored beside a piece of AI output (JEF-547). `answeredBy` is
 * what the provider that answered reported, so after a failover it names the
 * leg that wrote the text. Null when the call was not usage-tracked, in which
 * case the output simply carries no snapshot.
 */
export function toAiGeneration(
  answeredBy: LLMAnsweredBy | undefined,
  promptVersion: number,
): AiGeneration | null {
  if (!answeredBy) return null;
  return {
    provider: answeredBy.provider,
    model: answeredBy.model,
    promptVersion,
    source: answeredBy.source,
    tier: answeredBy.tier ?? null,
  };
}
