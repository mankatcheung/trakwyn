import { AiResponseInvalidError } from '#src/use-cases/errors/DomainError.js';
import type { LLMCompleteResult } from '#src/use-cases/ports/ILLMProvider.js';
import type { ZodType } from 'zod';

/**
 * A reply the provider cut off at the output budget is not "invalid JSON"
 * — it is incomplete, and asking again with the same input will be cut off
 * again (F2). Checked before `parseAiJson` so the user hears which it was
 * instead of paying for a retry that cannot succeed.
 */
export function assertNotTruncated(result: Pick<LLMCompleteResult, 'truncated'>): void {
  if (result.truncated) {
    throw new AiResponseInvalidError(
      'The AI ran out of room before finishing its reply — try again with less input, or shorten the text it was given',
    );
  }
}

/**
 * Parses an LLM's JSON response against a Zod schema, instead of a bare
 * `JSON.parse(...) as Partial<T>` type assertion with no runtime check.
 *
 * On any failure — the response isn't valid JSON, or it is but doesn't
 * match `schema` (wrong types, missing required fields) — throws a coded
 * AI_RESPONSE_INVALID error rather than silently falling back to a default.
 * A silent default is indistinguishable from a genuine model answer (e.g.
 * "the model scored this 0" vs. "we couldn't parse the response"), which is
 * exactly the gap this closes (JEF-108).
 */
export function parseAiJson<T>(raw: string, schema: ZodType<T>): T {
  const clean = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();

  let json: unknown;
  try {
    json = JSON.parse(clean);
  } catch {
    throw new AiResponseInvalidError("The AI's response couldn't be understood — please try again");
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    throw new AiResponseInvalidError("The AI's response couldn't be understood — please try again");
  }

  return result.data;
}
