/*
 * The text `pnpm --filter @trakwyn/api eval --help` prints (JEF-658).
 *
 * The flags are listed here by hand, with the wording of the README's "Flags"
 * table, and `evalHelp.test.ts` fails when `parseEvalArgs.ts` accepts a flag
 * this list does not describe, so the two cannot drift apart.
 */

export interface EvalHelpFlag {
  readonly flag: string;
  /** The value's placeholder, set only for a flag that takes one. */
  readonly value?: string;
  readonly description: string;
}

const HELP_FLAGS = ['--help', '-h'] as const;

export const EVAL_HELP_FLAGS: readonly EvalHelpFlag[] = [
  {
    flag: '--target',
    value: 'provider[:model]',
    description:
      'A model to test. Repeat it to compare models in one table. Without it EVAL_PROVIDER and EVAL_MODEL are used.',
  },
  {
    flag: '--case',
    value: 'id[,id]',
    description:
      'Run only these cases. Repeat the flag or separate ids with commas. Without it all cases run.',
  },
  {
    flag: '--min-pass-rate',
    value: '0-1',
    description: 'The pass rate a target must reach for the run to succeed. Default 0.8.',
  },
  {
    flag: '--max-error-rate',
    value: '0-1',
    description:
      'The share of a target’s cases that may end in error before the run exits 4. Default 0.1.',
  },
  {
    flag: '--cache',
    description: 'Store each reply on disk and reuse it on the next run.',
  },
  {
    flag: '--refresh',
    description: 'Ask the model again and overwrite what is stored. Implies --cache.',
  },
  {
    flag: '--validate-judge',
    description:
      'Run only the judge checks and print each verdict. Needs the EVAL_JUDGE_* variables and no target.',
  },
  {
    flag: '--publish',
    description: 'After the run, upload it to Langfuse. Needs the EVAL_LANGFUSE_* keys.',
  },
  {
    flag: '--label',
    value: 'name',
    description: 'Add a name to the run’s saved folder, for example baseline.',
  },
  {
    flag: '--publish-from',
    value: 'run-dir',
    description: 'Upload a saved run to Langfuse without calling any model.',
  },
  {
    flag: '--force',
    description: 'With --publish-from: upload even though the folder was already published.',
  },
  {
    flag: '--show',
    value: 'run-dir',
    description: 'Print a saved run’s transcripts as readable text. Calls no model.',
  },
  {
    flag: '--no-save',
    description: 'Do not keep this run in a folder. Without it every run is saved.',
  },
  {
    flag: '--out',
    value: 'file',
    description: 'Also write the full report to this file. An existing file is overwritten.',
  },
  {
    flag: '--help',
    description: 'Print this help and exit. Wins over every other argument.',
  },
];

const EXIT_CODES: readonly (readonly [number, string])[] = [
  [0, 'every target met the pass rate'],
  [1, 'a target fell short, or the judge was not trusted'],
  [2, 'the arguments were wrong'],
  [3, 'a target stopped on its provider’s daily quota, which is no score'],
  [4, 'a target had more errors than --max-error-rate allows'],
];

/** True when the arguments ask for help, wherever the flag sits among them. */
export function wantsHelp(argv: readonly string[]): boolean {
  return argv.some((arg) => (HELP_FLAGS as readonly string[]).includes(arg));
}

function flagLabel({ flag, value }: EvalHelpFlag): string {
  if (flag === '--help') return HELP_FLAGS.join(', ');
  return value === undefined ? flag : `${flag} <${value}>`;
}

export function formatEvalHelp(): string {
  const labels = EVAL_HELP_FLAGS.map(flagLabel);
  const width = Math.max(...labels.map((label) => label.length));
  const rows = EVAL_HELP_FLAGS.map(
    (entry, index) => `  ${(labels[index] as string).padEnd(width)}  ${entry.description}`,
  );

  return [
    'Usage: pnpm --filter @trakwyn/api eval [options]',
    '',
    'Runs the AI eval cases against real models. This calls paid APIs, so run it on purpose.',
    '',
    'Options:',
    ...rows,
    '',
    'Exit codes:',
    ...EXIT_CODES.map(([code, meaning]) => `  ${code}  ${meaning}`),
    '',
    'The target and judge come from the environment: EVAL_PROVIDER, EVAL_MODEL, EVAL_API_KEY',
    'and EVAL_JUDGE_*. See src/evals/README.md for every variable and example commands.',
  ].join('\n');
}
