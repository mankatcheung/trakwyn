import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ILLMProvider,
  LLMCompleteOptions,
  LLMCompleteResult,
  LLMMessage,
} from '#src/use-cases/ports/ILLMProvider.js';

export interface CachingOptions {
  dir: string;
  /** What the replies belong to, e.g. `openai:gpt-x`: the same prompt on another model is a different entry. */
  namespace: string;
  /** Skip reading what is stored; the fresh reply still overwrites it. */
  refresh: boolean;
}

/**
 * Hash of everything that decides the reply. The prompt text is part of
 * `messages`, so editing a prompt invalidates its entries by itself. The API
 * key is not an input, so it never reaches the cache directory.
 */
export function cacheKey(
  namespace: string,
  messages: LLMMessage[],
  maxTokens: number | undefined,
  options: LLMCompleteOptions | undefined,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        namespace,
        messages,
        maxTokens: maxTokens ?? null,
        options: options ?? null,
      }),
    )
    .digest('hex');
}

function readEntry(file: string): LLMCompleteResult | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null && 'content' in parsed) {
      return parsed as LLMCompleteResult;
    }
  } catch {
    // Missing or corrupt: either way the answer is to ask the model again.
  }
  return null;
}

/**
 * Stores each `complete` reply as a file so a re-run, after changing a check
 * or a fixture, costs nothing. Only successes are stored. Streaming is not
 * cached; no eval uses it.
 */
export function cachingProvider(inner: ILLMProvider, options: CachingOptions): ILLMProvider {
  return {
    async complete(messages, maxTokens, signal, completeOptions) {
      const file = join(
        options.dir,
        `${cacheKey(options.namespace, messages, maxTokens, completeOptions)}.json`,
      );

      if (!options.refresh) {
        const hit = readEntry(file);
        if (hit) return hit;
      }

      const result = await inner.complete(messages, maxTokens, signal, completeOptions);
      mkdirSync(options.dir, { recursive: true });
      writeFileSync(file, JSON.stringify(result));
      return result;
    },
    completeWithToolsStream: (messages, tools, maxTokens, signal) =>
      inner.completeWithToolsStream(messages, tools, maxTokens, signal),
  };
}
