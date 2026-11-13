import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { LlmProviderError, type LlmProviderErrorKind } from '#src/use-cases/errors/DomainError.js';
import type {
  ILLMProvider,
  LLMCompleteResult,
  LLMMessage,
  LLMUsage,
} from '#src/use-cases/ports/ILLMProvider.js';
import {
  CLAUDE_CODE_PROVIDER,
  CLAUDE_CODE_DEFAULT_BIN,
  CLAUDE_CODE_TIMEOUT_MS,
} from '#src/evals/types.js';

/** What one `claude -p` run left behind. */
export interface SpawnResult {
  /** `null` when the process was killed or never started. */
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** Set when the binary could not be started (`ENOENT`). */
  startError: string | null;
}

export interface SpawnRequest {
  bin: string;
  args: string[];
  cwd: string;
  input: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

export type ClaudeCodeSpawn = (request: SpawnRequest) => Promise<SpawnResult>;

export interface ClaudeCodeOptions {
  model: string | null;
  bin?: string;
  /** Calls allowed at once. One by default, so a full run is not a burst against subscription limits. */
  concurrency?: number;
  timeoutMs?: number;
  spawn?: ClaudeCodeSpawn;
}

/** Why a `claudecode` target cannot run a chat case; the report shows it as the case's `error`. */
export const CLAUDE_CODE_CHAT_UNSUPPORTED =
  'The claudecode provider cannot run chat cases: `claude -p` takes no native tool schemas, and faking tool calls in the prompt would change what the case measures. Use another target for chat-* cases.';

const EXCERPT_CHARS = 300;

/** Whether the `claude` binary can be started; replaced in tests. */
export type BinaryCheck = (
  bin: string,
  env: Readonly<Record<string, string | undefined>>,
) => boolean;

export const binaryExists: BinaryCheck = (bin, env) => {
  if (isAbsolute(bin) || bin.includes('/')) return existsSync(bin);
  return (env.PATH ?? '')
    .split(delimiter)
    .filter((dir) => dir !== '')
    .some((dir) => existsSync(join(dir, bin)));
};

/** Run settings read from the environment: the binary and how many calls may overlap. */
export function claudeCodeSettings(env: Readonly<Record<string, string | undefined>>): {
  bin: string;
  concurrency: number;
} {
  const raw = Number(env.EVAL_CLAUDE_CODE_CONCURRENCY);
  return {
    bin: env.EVAL_CLAUDE_CODE_BIN?.trim() || CLAUDE_CODE_DEFAULT_BIN,
    concurrency: Number.isInteger(raw) && raw >= 1 ? raw : 1,
  };
}

/**
 * Arguments for one call. `--setting-sources project` run from an empty
 * directory keeps the user's CLAUDE.md, rules, hooks and skills out of the
 * prompt (a one-word reply otherwise cost 185k input tokens), and `--tools ""`
 * leaves the model nothing to call.
 */
export function buildClaudeArgs(model: string | null, systemPrompt: string | null): string[] {
  return [
    '-p',
    '--output-format',
    'json',
    '--tools',
    '',
    '--max-turns',
    '1',
    '--no-session-persistence',
    '--setting-sources',
    'project',
    '--disable-slash-commands',
    ...(model ? ['--model', model] : []),
    ...(systemPrompt !== null ? ['--system-prompt', systemPrompt] : []),
  ];
}

/** System messages become the system prompt; everything else is the stdin text. */
export function splitMessages(messages: LLMMessage[]): {
  systemPrompt: string | null;
  input: string;
} {
  const system = messages.filter((message) => message.role === 'system');
  const rest = messages.filter((message) => message.role !== 'system');
  const input =
    rest.length === 1 && rest[0]?.role === 'user'
      ? rest[0].content
      : rest.map((message) => `${message.role}: ${message.content}`).join('\n\n');
  return {
    systemPrompt:
      system.length === 0 ? null : system.map((message) => message.content).join('\n\n'),
    input,
  };
}

interface ClaudeJson {
  result?: unknown;
  is_error?: unknown;
  api_error_status?: unknown;
  stop_reason?: unknown;
  usage?: Record<string, unknown>;
}

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

function usageOf(usage: ClaudeJson['usage']): LLMUsage | null {
  if (!usage) return null;
  const cacheRead = count(usage.cache_read_input_tokens);
  const cacheWrite = count(usage.cache_creation_input_tokens);
  return {
    promptTokens: count(usage.input_tokens) + cacheRead + cacheWrite,
    completionTokens: count(usage.output_tokens),
    ...(cacheRead > 0 ? { cacheReadTokens: cacheRead } : {}),
    ...(cacheWrite > 0 ? { cacheWriteTokens: cacheWrite } : {}),
  };
}

const USAGE_LIMIT = /usage limit|limit reached|out of (extra )?usage|quota|resets? (at|in)/i;
const RATE_LIMIT = /rate.?limit|too many requests|overloaded/i;

/** Maps what the CLI said to the error kinds the report and `quotaStop.ts` already know. */
function failureKind(status: number | null, text: string): LlmProviderErrorKind {
  if (USAGE_LIMIT.test(text)) return 'quota';
  if (status === 429 || RATE_LIMIT.test(text)) return 'rate_limited';
  if (status === 401 || status === 403 || /not logged in|\/login|authenticat/i.test(text)) {
    return 'auth';
  }
  if (status === 400 || status === 404 || /unrecognized_model|model/i.test(text)) {
    return 'bad_request';
  }
  return 'unavailable';
}

const providerError = (kind: LlmProviderErrorKind, status: number | null, detail: string) =>
  new LlmProviderError(kind, {
    provider: CLAUDE_CODE_PROVIDER,
    status,
    detail: detail.trim().slice(0, EXCERPT_CHARS) || null,
  });

function parseOutput(stdout: string): ClaudeJson | null {
  try {
    const parsed: unknown = JSON.parse(stdout);
    return typeof parsed === 'object' && parsed !== null ? (parsed as ClaudeJson) : null;
  } catch {
    return null;
  }
}

/** Turns one finished run into a reply, or the provider error the report shows. */
export function readResult(run: SpawnResult, timeoutMs: number): LLMCompleteResult {
  if (run.startError !== null) throw providerError('unreachable', null, run.startError);
  if (run.timedOut) {
    throw providerError('unavailable', null, `claude -p did not finish within ${timeoutMs} ms`);
  }

  const parsed = parseOutput(run.stdout);
  const status = typeof parsed?.api_error_status === 'number' ? parsed.api_error_status : null;
  const text = typeof parsed?.result === 'string' ? parsed.result : '';

  if (run.code !== 0 || parsed === null || parsed.is_error === true) {
    const detail = text || run.stderr || run.stdout || `exit code ${run.code}`;
    throw providerError(failureKind(status, detail), status, detail);
  }
  if (typeof parsed.result !== 'string') {
    throw providerError('unavailable', null, 'claude -p returned no result field');
  }

  return {
    content: text,
    usage: usageOf(parsed.usage),
    ...(parsed.stop_reason === 'max_tokens' ? { truncated: true } : {}),
  };
}

/** The real thing: stdin in, stdout out, killed when the timeout or the signal fires. */
export const spawnClaude: ClaudeCodeSpawn = (request) =>
  new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const finish = (result: SpawnResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };

    const child = nodeSpawn(request.bin, request.args, {
      cwd: request.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const onAbort = () => child.kill('SIGKILL');
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, request.timeoutMs);
    request.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', (error) =>
      finish({ code: null, stdout, stderr, timedOut, startError: error.message }),
    );
    child.on('close', (code) => finish({ code, stdout, stderr, timedOut, startError: null }));
    child.stdin.on('error', () => undefined);
    child.stdin.end(request.input);
  });

/** Lets at most `limit` tasks run at once, in arrival order. */
function limiter(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: Array<() => void> = [];
  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };
  return async (task) => {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}

/**
 * Runs a model through the Claude Code CLI so the judge and single-call cases
 * can use a subscription instead of an API key (JEF-563). Eval-only: it is
 * never registered as a product provider. Claude Code wraps the prompt in its
 * own, and temperature and max tokens cannot be set, so read its score as a
 * reference, not as proof a production prompt works. Chat is refused.
 */
export function createClaudeCodeProvider(options: ClaudeCodeOptions): ILLMProvider {
  const bin = options.bin ?? CLAUDE_CODE_DEFAULT_BIN;
  const timeoutMs = options.timeoutMs ?? CLAUDE_CODE_TIMEOUT_MS;
  const run = options.spawn ?? spawnClaude;
  const limit = limiter(options.concurrency ?? 1);

  return {
    async complete(messages, _maxTokens, signal) {
      const { systemPrompt, input } = splitMessages(messages);
      return limit(async () => {
        signal?.throwIfAborted();
        const cwd = await mkdtemp(join(tmpdir(), 'trakwyn-eval-claude-'));
        try {
          const result = await run({
            bin,
            args: buildClaudeArgs(options.model, systemPrompt),
            cwd,
            input,
            timeoutMs,
            signal,
          });
          return readResult(result, timeoutMs);
        } finally {
          await rm(cwd, { recursive: true, force: true });
        }
      });
    },

    async *completeWithToolsStream() {
      throw new Error(CLAUDE_CODE_CHAT_UNSUPPORTED);
    },
  };
}
