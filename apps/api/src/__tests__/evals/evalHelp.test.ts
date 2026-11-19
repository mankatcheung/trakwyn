import { describe, expect, it } from 'vitest';
import { EVAL_HELP_FLAGS, formatEvalHelp, wantsHelp } from '#src/evals/evalHelp.js';
import { SWITCH_FLAGS, VALUE_FLAGS } from '#src/evals/parseEvalArgs.js';

describe('wantsHelp', () => {
  it.each([
    [['--help']],
    [['-h']],
    [['--target', 'openai', '--help']],
    [['--cache', '-h', '--case', 'jd-clean']],
  ])('is true for %j', (argv) => {
    expect(wantsHelp(argv)).toBe(true);
  });

  it.each([[[]], [['--target', 'openai']], [['--case', 'help']]])('is false for %j', (argv) => {
    expect(wantsHelp(argv)).toBe(false);
  });
});

describe('EVAL_HELP_FLAGS', () => {
  const documented = EVAL_HELP_FLAGS.map(({ flag }) => flag);

  it('describes every flag the parser accepts', () => {
    const missing = [...VALUE_FLAGS, ...SWITCH_FLAGS].filter((flag) => !documented.includes(flag));
    expect(missing).toEqual([]);
  });

  it('describes no flag the parser does not accept', () => {
    const accepted: readonly string[] = [...VALUE_FLAGS, ...SWITCH_FLAGS, '--help'];
    expect(documented.filter((flag) => !accepted.includes(flag))).toEqual([]);
  });

  it('gives every flag a description and a value name only for flags that take a value', () => {
    for (const entry of EVAL_HELP_FLAGS) {
      expect(entry.description.trim()).not.toBe('');
      const takesValue = (VALUE_FLAGS as readonly string[]).includes(entry.flag);
      expect(entry.value !== undefined).toBe(takesValue);
    }
  });
});

describe('formatEvalHelp', () => {
  const help = formatEvalHelp();

  it('starts with the usage line', () => {
    expect(help).toContain('pnpm --filter @trakwyn/api eval [options]');
  });

  it('lists every flag with its description', () => {
    for (const { flag, description } of EVAL_HELP_FLAGS) {
      expect(help).toContain(flag);
      expect(help).toContain(description);
    }
  });

  it('lists --help and -h themselves', () => {
    expect(help).toContain('--help, -h');
  });

  it('lists the exit codes 0 to 4', () => {
    for (const code of [0, 1, 2, 3, 4]) {
      expect(help).toMatch(new RegExp(`^\\s+${code}\\s+\\S`, 'm'));
    }
  });

  it('points to the README and the main variables', () => {
    expect(help).toContain('src/evals/README.md');
    expect(help).toContain('EVAL_PROVIDER');
    expect(help).toContain('EVAL_JUDGE_');
  });
});
