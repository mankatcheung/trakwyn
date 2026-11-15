import type { ILLMProvider, LLMReasoning } from '#src/use-cases/ports/ILLMProvider.js';

const LEVELS: readonly LLMReasoning[] = ['off', 'low', 'default'];

/**
 * `EVAL_REASONING`: off, low or default, or unset for each use case's own
 * setting (`AI_REASONING_DEFAULTS`). Throws a message for anything else, so a
 * typo does not quietly run the comparison it was meant to make on the default.
 */
export function parseReasoning(value: string | undefined): LLMReasoning | null {
  const level = value?.trim().toLowerCase();
  if (!level) return null;
  if ((LEVELS as readonly string[]).includes(level)) return level as LLMReasoning;
  throw new Error(`EVAL_REASONING must be off, low or default, not "${value}"`);
}

/**
 * The provider with `reasoning` forced on every `complete` call (JEF-599), so
 * the same cases can be run with a feature's reasoning off and on and the
 * scores compared. Only the model under test is wrapped: the judge always
 * answers with reasoning off, so its scores stay comparable. Everything else
 * on the provider is passed through as it is.
 */
export function withReasoning(provider: ILLMProvider, level: LLMReasoning): ILLMProvider {
  return new Proxy(provider, {
    get(target, property) {
      if (property === 'complete') {
        return (...args: Parameters<ILLMProvider['complete']>) => {
          const [messages, maxTokens, signal, options] = args;
          return target.complete(messages, maxTokens, signal, { ...options, reasoning: level });
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
