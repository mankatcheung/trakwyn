import type { Application } from '#src/domain/application/Application.js';

/**
 * The posting an AI feature should read for an application (JEF-591).
 *
 * `postingText` is the employer's own wording and `description` is usually a
 * two or three sentence summary of it, so the full text wins. The exception is
 * a `description` that is the longer of the two: before `postingText` existed
 * the only place to paste a whole posting was the description, and a client
 * that cannot edit `postingText` (mobile) still updates the description alone.
 * Taking the longer one keeps both of those working without a stale full text
 * hiding a newer, fuller description.
 *
 * Returns `null` when the application has neither. Callers cut the result to
 * their own `AI_PROMPT_INPUT` limit.
 */
export function postingForPrompt(
  app: Pick<Application, 'description' | 'postingText'>,
): string | null {
  const full = app.postingText?.trim() ?? '';
  const summary = app.description?.trim() ?? '';
  const chosen = summary.length > full.length ? summary : full;
  return chosen || null;
}
