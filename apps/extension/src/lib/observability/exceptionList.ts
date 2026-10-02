import { scrubString } from './scrub';

/**
 * PostHog's `$exception_list`, built by hand (JEF-387), as
 * apps/web/src/server/observability/exceptionList.ts does for the Vercel
 * function. The difference is the stacks: an extension runs in Chrome (V8)
 * and Safari (JavaScriptCore), which print frames differently.
 */

export interface StackFrame {
  platform: 'web:javascript';
  filename?: string;
  function: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
}

export interface ExceptionEntry {
  type: string;
  value: string;
  mechanism: { type: 'generic'; handled: boolean; synthetic: boolean };
  stacktrace?: { type: 'raw'; frames: StackFrame[] };
}

/** The same cap PostHog's own parser applies. */
export const STACK_FRAME_LIMIT = 50;

const UNKNOWN_FUNCTION = '?';

/** Chrome: `at fn (file:line:col)`, `at file:line:col`, `at async fn (…)`. */
const V8_FRAME = /^\s*at (?:async )?(?:(.+?)\s+\()?(?:(.+):(\d+):(\d+)|([^)]+))\)?\s*$/;
/** Safari: `fn@file:line:col`, `@file:line:col`. */
const JSC_FRAME = /^\s*(?:(.*?)@)?(.+):(\d+):(\d+)\s*$/;

/** `chrome-extension://…` and `safari-web-extension://…`: the extension's own files. */
const EXTENSION_URL = /^[a-z-]+-extension:\/\//;

function toInt(value: string | undefined): number | undefined {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function frame(
  fn: string | undefined,
  filename: string | undefined,
  lineno: string | undefined,
  colno: string | undefined,
): StackFrame {
  return {
    platform: 'web:javascript',
    filename,
    function: fn && fn !== '<anonymous>' ? fn : UNKNOWN_FUNCTION,
    lineno: toInt(lineno),
    colno: toInt(colno),
    in_app: filename !== undefined && EXTENSION_URL.test(filename),
  };
}

function parseFrame(line: string): StackFrame | undefined {
  const v8 = V8_FRAME.exec(line);
  if (v8) {
    const [, fn, file, lineno, colno, bare] = v8;
    return frame(fn, file ?? (bare === 'native' ? undefined : bare), lineno, colno);
  }
  const jsc = JSC_FRAME.exec(line);
  if (jsc) {
    const [, fn, file, lineno, colno] = jsc;
    return frame(fn, file, lineno, colno);
  }
  return undefined;
}

/**
 * A stack as PostHog frames: outermost first, innermost last (both engines
 * print the reverse), at most `STACK_FRAME_LIMIT` of the innermost ones.
 *
 * Each line is scrubbed before it is parsed, so a frame cannot carry what
 * the text would not. Per line, not the stack as a whole: the scrubber clips
 * long strings, which would cut a real stack off after four or five frames.
 */
export function parseStack(stack: string): StackFrame[] {
  // `slice` returns a fresh array, so `reverse` mutates nothing shared.
  return stack
    .split('\n')
    .map((line) => parseFrame(scrubString(line)))
    .filter((parsed): parsed is StackFrame => parsed !== undefined)
    .slice(0, STACK_FRAME_LIMIT)
    .reverse();
}

/**
 * One entry per report: the error's type, message and stack, each through
 * the scrubber. A message quotes the value that broke, and that value can be
 * an email or a token. A non-Error throw reports its type only, never its
 * value.
 */
export function buildExceptionList(error: unknown, handled: boolean): ExceptionEntry[] {
  const mechanism = { type: 'generic', handled, synthetic: false } as const;
  if (error instanceof Error) {
    const frames = error.stack ? parseStack(error.stack) : [];
    return [
      {
        type: error.name,
        value: scrubString(error.message),
        mechanism,
        ...(frames.length > 0 ? { stacktrace: { type: 'raw', frames } } : {}),
      },
    ];
  }
  return [{ type: typeof error, value: `A non-Error ${typeof error} was thrown`, mechanism }];
}
