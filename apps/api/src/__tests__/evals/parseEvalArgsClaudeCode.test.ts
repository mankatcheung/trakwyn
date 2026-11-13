import { describe, expect, it } from 'vitest';
import { parseEvalArgs } from '#src/evals/parseEvalArgs.js';

const found = () => true;
const missing = () => false;

describe('parseEvalArgs: claudecode (JEF-563)', () => {
  it('is a target with no key or base URL', () => {
    const config = parseEvalArgs(['--target', 'claudecode:sonnet'], {}, found);

    expect(config.targets).toEqual([
      { provider: 'claudecode', model: 'sonnet', apiKey: '', baseUrl: null },
    ]);
  });

  it('is a judge with no key', () => {
    const config = parseEvalArgs(
      ['--validate-judge'],
      { EVAL_JUDGE_PROVIDER: 'claudecode', EVAL_JUDGE_MODEL: 'opus' },
      found,
    );

    expect(config.judge).toEqual({
      provider: 'claudecode',
      model: 'opus',
      apiKey: '',
      baseUrl: null,
    });
  });

  it('fails for a missing binary, naming it and the override, before any call', () => {
    expect(() => parseEvalArgs(['--target', 'claudecode'], {}, missing)).toThrow(
      /"claude" was not found.*EVAL_CLAUDE_CODE_BIN/,
    );
    expect(() =>
      parseEvalArgs(['--validate-judge'], { EVAL_JUDGE_PROVIDER: 'claudecode' }, missing),
    ).toThrow(/Claude Code CLI/);
  });

  it('looks for EVAL_CLAUDE_CODE_BIN when set', () => {
    const seen: string[] = [];
    parseEvalArgs(['--target', 'claudecode'], { EVAL_CLAUDE_CODE_BIN: '/opt/claude' }, (bin) => {
      seen.push(bin);
      return true;
    });

    expect(seen).toEqual(['/opt/claude']);
  });
});
