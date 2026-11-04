import { REASONING_CONTROL } from '#src/infrastructure/config/constants.js';

/**
 * The request fields that turn thinking off or down on a Workers AI model
 * (JEF-453, JEF-445). A model with no rule gets nothing: an unknown parameter
 * can be answered with a 400.
 */
export function workersAiReasoningFields(
  model: string,
): (reasoning: 'off' | 'low') => Record<string, unknown> {
  const rule = REASONING_CONTROL.WORKERS_AI_MODELS.find((r) => r.pattern.test(model));
  return (reasoning) => {
    if (!rule) return {};
    return reasoning === 'off' ? rule.off : rule.low;
  };
}
