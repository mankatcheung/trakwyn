import type { AiFeature } from '#src/use-cases/constants.js';
import type { LLMMessage } from '#src/use-cases/ports/ILLMProvider.js';

/**
 * One AI prompt: the wording a feature sends to the model, with the name and
 * version it is recorded under (JEF-505).
 *
 * `id` is the feature's `AI_FEATURE`, so a prompt and the usage tag on the
 * calls it makes cannot disagree. `version` is a whole number a person bumps
 * whenever the rendered text changes; `promptVersions.test.ts` hashes each
 * prompt and fails when the text moved and the version did not. The version is
 * stored on every `LlmUsageEvent` and printed by the evals, which is what lets
 * a change in output quality or cost be traced to a change in wording.
 *
 * A prompt is a pure function from its inputs to messages. It holds no
 * dependencies and is not registered in the container.
 */
export interface PromptDefinition<Input> {
  readonly id: AiFeature;
  readonly version: number;
  build(input: Input): LLMMessage[];
}
