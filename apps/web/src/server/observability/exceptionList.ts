import { scrubString } from '#/lib/analytics/scrub';

/**
 * PostHog's `$exception_list`, built by hand (JEF-374). `posthog-node` would
 * do this, but adding any dependency to `apps/web` re-resolves its
 * `latest`-pinned TanStack packages (apps/web/CLAUDE.md), so the Node stack
 * parsing is ported here from `@posthog/core`'s `nodeStackLineParser`, cut
 * down to what a V8 stack from this function produces.
 */

export interface StackFrame {
  platform: 'node:javascript';
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

/** `at fn (file:line:col)`, `at file:line:col`, `at async fn (…)`, `at fn (native)`. */
const V8_FRAME = /^\s*at (?:async )?(?:(.+?)\s+\()?(?:(.+):(\d+):(\d+)|([^)]+))\)?\s*$/;

function toInt(value: string | undefined): number | undefined {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Ours, rather than Node's internals or a dependency's. */
function isInApp(filename: string | undefined): boolean {
  if (!filename) return false;
  const absolute = filename.startsWith('/') || /^[A-Z]:/.test(filename);
  return absolute && !filename.includes('node_modules/');
}

function parseFrame(line: string): StackFrame | undefined {
  const match = V8_FRAME.exec(line);
  if (!match) return undefined;
  const [, fn, file, lineno, colno, bare] = match;
  const raw = file ?? (bare === 'native' ? undefined : bare);
  const filename = raw?.startsWith('file://') ? raw.slice('file://'.length) : raw;
  return {
    platform: 'node:javascript',
    filename,
    function: fn && fn !== '<anonymous>' ? fn : UNKNOWN_FUNCTION,
    lineno: toInt(lineno),
    colno: toInt(colno),
    in_app: isInApp(filename),
  };
}

/**
 * A V8 stack as PostHog frames: outermost first, innermost last (V8 prints
 * the reverse), at most `STACK_FRAME_LIMIT` of the innermost ones.
 */
export function parseStack(stack: string): StackFrame[] {
  // `slice` returns a fresh array, so `reverse` mutates nothing shared.
  return stack
    .split('\n')
    .map(parseFrame)
    .filter((frame): frame is StackFrame => frame !== undefined)
    .slice(0, STACK_FRAME_LIMIT)
    .reverse();
}

/**
 * One entry per report: the error's type, message and stack, each through
 * the same pattern redaction PostHog client events get — a message quotes
 * the value that broke, and that value can be an email or a token from the
 * URL. The stack is scrubbed as text before it is parsed, so a frame cannot
 * carry what the text would not. A non-Error throw reports its type only,
 * never its value.
 */
export function buildExceptionList(error: unknown, fallbackType: string): ExceptionEntry[] {
  // Every report reached a catch or an error callback: nothing here was handled.
  const mechanism = { type: 'generic', handled: false, synthetic: false } as const;
  if (error instanceof Error) {
    const frames = error.stack ? parseStack(scrubString(error.stack)) : [];
    return [
      {
        type: error.name,
        value: scrubString(error.message),
        mechanism,
        ...(frames.length > 0 ? { stacktrace: { type: 'raw', frames } } : {}),
      },
    ];
  }
  if (error === undefined) {
    return [{ type: fallbackType, value: fallbackType, mechanism }];
  }
  return [{ type: typeof error, value: `A non-Error ${typeof error} was thrown`, mechanism }];
}
