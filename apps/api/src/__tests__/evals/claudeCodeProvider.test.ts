import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  CLAUDE_CODE_CHAT_UNSUPPORTED,
  buildClaudeArgs,
  claudeCodeSettings,
  createClaudeCodeProvider,
  splitMessages,
  type ClaudeCodeSpawn,
  type SpawnResult,
} from '#src/evals/claudeCodeProvider.js';
import { isQuotaStop } from '#src/evals/quotaStop.js';
import { runCase } from '#src/evals/runCase.js';
import { LlmProviderError } from '#src/use-cases/errors/DomainError.js';
import type { EvalCase } from '#src/evals/types.js';

const okJson = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    is_error: false,
    result: 'hello',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 2,
      cache_creation_input_tokens: 10,
      cache_read_input_tokens: 5,
      output_tokens: 7,
    },
    ...extra,
  });

const run = (partial: Partial<SpawnResult>): SpawnResult => ({
  code: 0,
  stdout: okJson(),
  stderr: '',
  timedOut: false,
  startError: null,
  ...partial,
});

const fake = (result: Partial<SpawnResult> = {}) => vi.fn<ClaudeCodeSpawn>(async () => run(result));

const user = [{ role: 'user' as const, content: 'hi' }];

describe('claudecode provider', () => {
  it('builds the isolated, tool-less, single-turn command', () => {
    const args = buildClaudeArgs('sonnet', 'be brief');

    expect(args).toEqual(
      expect.arrayContaining(['-p', '--tools', '', '--max-turns', '1', '--no-session-persistence']),
    );
    expect(args.join(' ')).toContain('--setting-sources project');
    expect(args.join(' ')).toContain('--model sonnet');
    expect(args.join(' ')).toContain('--system-prompt be brief');
    expect(buildClaudeArgs(null, null)).not.toContain('--model');
    expect(buildClaudeArgs(null, null)).not.toContain('--system-prompt');
  });

  it('maps system messages to the system prompt and the rest to stdin', async () => {
    const spawn = fake();
    const provider = createClaudeCodeProvider({ model: 'm', spawn });

    await provider.complete([
      { role: 'system', content: 'S1' },
      { role: 'system', content: 'S2' },
      { role: 'user', content: 'question' },
    ]);

    const request = spawn.mock.calls[0]![0];
    expect(request.input).toBe('question');
    expect(request.args[request.args.indexOf('--system-prompt') + 1]).toBe('S1\n\nS2');
    expect(request.bin).toBe('claude');
  });

  it('labels turns when there is more than one non-system message', () => {
    expect(
      splitMessages([
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
      ]).input,
    ).toBe('user: a\n\nassistant: b');
  });

  it('runs from an empty directory that is gone afterwards', async () => {
    const spawn = fake();
    await createClaudeCodeProvider({ model: null, spawn }).complete(user);

    expect(existsSync(spawn.mock.calls[0]![0].cwd)).toBe(false);
  });

  it('reads the reply and folds cache tokens into the prompt count', async () => {
    const result = await createClaudeCodeProvider({ model: null, spawn: fake() }).complete(user);

    expect(result).toEqual({
      content: 'hello',
      usage: { promptTokens: 17, completionTokens: 7, cacheReadTokens: 5, cacheWriteTokens: 10 },
    });
  });

  it('flags a reply cut off by max_tokens', async () => {
    const spawn = fake({ stdout: okJson({ stop_reason: 'max_tokens' }) });
    const result = await createClaudeCodeProvider({ model: null, spawn }).complete(user);

    expect(result.truncated).toBe(true);
  });

  const failure = async (partial: Partial<SpawnResult>) =>
    createClaudeCodeProvider({ model: null, spawn: fake(partial) })
      .complete(user)
      .then(
        () => null,
        (error: unknown) => error as LlmProviderError,
      );

  it('maps a non-zero exit to a provider error with the output as detail', async () => {
    const error = await failure({ code: 1, stdout: '', stderr: 'boom' });

    expect(error).toBeInstanceOf(LlmProviderError);
    expect(error?.kind).toBe('unavailable');
    expect(error?.detail).toBe('boom');
  });

  it('maps an is_error result, using its status', async () => {
    const error = await failure({
      stdout: okJson({ is_error: true, result: 'Invalid API key', api_error_status: 401 }),
    });

    expect(error?.kind).toBe('auth');
    expect(error?.status).toBe(401);
  });

  it('maps a timeout and a missing binary', async () => {
    expect((await failure({ timedOut: true, code: null }))?.detail).toContain('did not finish');
    expect((await failure({ startError: 'spawn claude ENOENT', code: null }))?.kind).toBe(
      'unreachable',
    );
  });

  it('maps a rate limit and a usage limit, and only the latter is a quota stop', async () => {
    const rate = await failure({
      stdout: okJson({ is_error: true, result: 'Too many requests', api_error_status: 429 }),
    });
    const usage = await failure({
      stdout: okJson({ is_error: true, result: 'Claude usage limit reached. Resets at 5pm' }),
    });

    expect(rate?.kind).toBe('rate_limited');
    expect(isQuotaStop(rate as LlmProviderError)).toBe(false);
    expect(usage?.kind).toBe('quota');
    expect(isQuotaStop(usage as LlmProviderError)).toBe(true);
  });

  it('treats unparseable output as a failure', async () => {
    expect((await failure({ stdout: 'not json' }))?.kind).toBe('unavailable');
  });

  it('runs one call at a time by default and honours a higher cap', async () => {
    const track = async (cap: number) => {
      let active = 0;
      let peak = 0;
      const spawn: ClaudeCodeSpawn = async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return run({});
      };
      const provider = createClaudeCodeProvider({ model: null, spawn, concurrency: cap });
      await Promise.all([1, 2, 3, 4].map(() => provider.complete(user)));
      return peak;
    };

    expect(await track(1)).toBe(1);
    expect(await track(2)).toBe(2);
  });

  it('refuses chat, and the case ends as error naming the limitation', async () => {
    const provider = createClaudeCodeProvider({ model: null, spawn: fake() });
    const chatCase = {
      id: 'chat-x',
      feature: 'chat',
      run: async (p: typeof provider) => {
        for await (const event of p.completeWithToolsStream([], [])) void event;
        return [];
      },
    } as unknown as EvalCase;

    const result = await runCase(chatCase, provider);

    expect(result.outcome).toBe('error');
    expect(result.failures[0]).toContain(CLAUDE_CODE_CHAT_UNSUPPORTED);
  });

  it('reads the binary and concurrency from the environment', () => {
    expect(claudeCodeSettings({})).toEqual({ bin: 'claude', concurrency: 1 });
    expect(
      claudeCodeSettings({ EVAL_CLAUDE_CODE_BIN: '/x/claude', EVAL_CLAUDE_CODE_CONCURRENCY: '3' }),
    ).toEqual({ bin: '/x/claude', concurrency: 3 });
    expect(claudeCodeSettings({ EVAL_CLAUDE_CODE_CONCURRENCY: '0' }).concurrency).toBe(1);
  });
});
