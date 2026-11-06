import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every AI call site names the feature it spends tokens for (JEF-444).
 * `LLMProviderRequest.feature` is required, so the compiler already refuses a
 * call without one; this reads the source so that a call routed around the
 * type (a cast, an `as never`) still fails, and so each call's feature is a
 * real `AI_FEATURE` entry rather than a string made up on the spot.
 */
const USE_CASES = join(process.cwd(), 'src', 'use-cases');
const CALL = /llmProviderFactory\s*\.\s*(?:forUser|resolveForUser)\(/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

/** The text of the argument list that opens at `open` (the index just past `(`). */
function argumentsAt(text: string, open: number): string {
  let depth = 1;
  let i = open;
  while (i < text.length && depth > 0) {
    if (text[i] === '(') depth += 1;
    if (text[i] === ')') depth -= 1;
    i += 1;
  }
  return text.slice(open, i - 1);
}

describe('AI feature tags', () => {
  const calls = sourceFiles(USE_CASES).flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    return [...text.matchAll(CALL)].map((m) => ({
      file: relative(USE_CASES, file).split(sep).join('/'),
      args: argumentsAt(text, (m.index ?? 0) + m[0].length),
    }));
  });

  it('finds the AI call sites', () => {
    expect(calls.length).toBeGreaterThanOrEqual(11);
  });

  it.each(calls.map((c) => [c.file, c.args] as const))(
    '%s resolves its provider with an AI_FEATURE',
    (_file, args) => {
      expect(args).toMatch(/feature:\s*AI_FEATURE\.[A-Z_]+/);
    },
  );

  // JEF-505: a call also says which version of its prompt it sends, so the
  // usage event can be traced to the wording. The key test sends a fixed probe
  // rather than one of our prompts, so it is the one call without a version.
  it.each(
    calls.filter((c) => !/AI_FEATURE\.KEY_TEST/.test(c.args)).map((c) => [c.file, c.args] as const),
  )('%s names the version of the prompt it sends', (_file, args) => {
    expect(args).toMatch(/promptVersion:\s*[a-zA-Z]+Prompt\.version/);
  });
});
