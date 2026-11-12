import { LLM_PROVIDER } from '#src/use-cases/constants.js';
import { LANGFUSE, PLATFORM_LLM } from '#src/infrastructure/config/constants.js';
import {
  WORKERS_AI_PROVIDER,
  type EvalConfig,
  type EvalTarget,
  type LangfuseConfig,
} from '#src/evals/types.js';

type Env = Readonly<Record<string, string | undefined>>;

const DEFAULT_MIN_PASS_RATE = 0.8;
export const DEFAULT_MAX_ERROR_RATE = 0.1;
const VALUE_FLAGS = [
  '--target',
  '--case',
  '--min-pass-rate',
  '--max-error-rate',
  '--out',
  '--label',
  '--publish-from',
  '--show',
] as const;
const SWITCH_FLAGS = [
  '--cache',
  '--refresh',
  '--validate-judge',
  '--publish',
  '--no-save',
  '--force',
] as const;
const SWITCH_KEYS = {
  '--cache': 'cache',
  '--refresh': 'refresh',
  '--publish': 'publish',
  '--validate-judge': 'validateJudge',
  '--no-save': 'noSave',
  '--force': 'force',
} as const;
const PROVIDERS: string[] = [...Object.values(LLM_PROVIDER), WORKERS_AI_PROVIDER];

function isValueFlag(arg: string): arg is (typeof VALUE_FLAGS)[number] {
  return (VALUE_FLAGS as readonly string[]).includes(arg);
}

function isSwitchFlag(arg: string): arg is (typeof SWITCH_FLAGS)[number] {
  return (SWITCH_FLAGS as readonly string[]).includes(arg);
}

interface RawFlags {
  targets: string[];
  cases: string[];
  minPassRate: string | null;
  maxErrorRate: string | null;
  out: string | null;
  label: string | null;
  cache: boolean;
  refresh: boolean;
  validateJudge: boolean;
  publish: boolean;
  noSave: boolean;
  force: boolean;
  publishFrom: string | null;
  show: string | null;
}

function readFlags(argv: string[]): RawFlags {
  let flags: RawFlags = {
    targets: [],
    cases: [],
    minPassRate: null,
    maxErrorRate: null,
    out: null,
    label: null,
    cache: false,
    refresh: false,
    validateJudge: false,
    publish: false,
    noSave: false,
    force: false,
    publishFrom: null,
    show: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;

    if (isSwitchFlag(arg)) {
      flags = { ...flags, [SWITCH_KEYS[arg]]: true };
    } else if (isValueFlag(arg)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} needs a value`);
      }
      index += 1;
      if (arg === '--target') flags = { ...flags, targets: [...flags.targets, value] };
      else if (arg === '--case') flags = { ...flags, cases: [...flags.cases, value] };
      else if (arg === '--out') flags = { ...flags, out: value };
      else if (arg === '--label') flags = { ...flags, label: value };
      else if (arg === '--publish-from') flags = { ...flags, publishFrom: value };
      else if (arg === '--show') flags = { ...flags, show: value };
      else if (arg === '--max-error-rate') flags = { ...flags, maxErrorRate: value };
      else flags = { ...flags, minPassRate: value };
    } else {
      throw new Error(`Unknown option ${arg}`);
    }
  }

  return flags;
}

/** The variables a grader reads instead of the target's (JEF-470). */
const JUDGE_KEY_VARIABLES = ['EVAL_JUDGE_API_KEY'];

/** Cloudflare credentials for `workersai`, kept apart from the production `PLATFORM_CLOUDFLARE_*` ones (JEF-540). */
const WORKERS_AI_VARIABLES = {
  target: { accountId: 'EVAL_CLOUDFLARE_ACCOUNT_ID', token: 'EVAL_CLOUDFLARE_API_TOKEN' },
  judge: {
    accountId: 'EVAL_JUDGE_CLOUDFLARE_ACCOUNT_ID',
    token: 'EVAL_JUDGE_CLOUDFLARE_API_TOKEN',
  },
} as const;

function parseWorkersAiTarget(model: string, env: Env, isJudge: boolean): EvalTarget {
  if (!model) {
    throw new Error('The workersai provider needs a model: --target workersai:<model>');
  }
  const names = WORKERS_AI_VARIABLES[isJudge ? 'judge' : 'target'];
  const accountId = env[names.accountId]?.trim();
  const token = env[names.token]?.trim();
  if (!accountId)
    throw new Error(`The workersai provider needs an account id: set ${names.accountId}`);
  if (!token) throw new Error(`The workersai provider needs an API token: set ${names.token}`);
  return {
    provider: WORKERS_AI_PROVIDER,
    model,
    apiKey: token,
    baseUrl: `${PLATFORM_LLM.REST_BASE}/${encodeURIComponent(accountId)}/${PLATFORM_LLM.REST_PATH}`,
  };
}

function parseTarget(spec: string, env: Env, keyVariables?: string[]): EvalTarget {
  // The first colon only: model names such as `anthropic/claude:beta` carry their own.
  const colon = spec.indexOf(':');
  const provider = colon === -1 ? spec : spec.slice(0, colon);
  const model = colon === -1 ? '' : spec.slice(colon + 1);

  if (!PROVIDERS.includes(provider)) {
    throw new Error(`Unknown provider "${provider}"; expected one of: ${PROVIDERS.join(', ')}`);
  }

  if (provider === WORKERS_AI_PROVIDER) {
    return parseWorkersAiTarget(model, env, keyVariables !== undefined);
  }

  const variables = keyVariables ?? [`EVAL_API_KEY_${provider.toUpperCase()}`, 'EVAL_API_KEY'];
  const apiKey = variables.map((name) => env[name]).find(Boolean);
  if (!apiKey) {
    throw new Error(`No API key for "${provider}": set ${variables.join(' or ')}`);
  }

  if (provider !== LLM_PROVIDER.CUSTOM) {
    return { provider, model: model || null, apiKey, baseUrl: null };
  }
  if (!model) {
    throw new Error('The custom provider needs a model: --target custom:<model>');
  }
  const baseUrlVariable = keyVariables ? 'EVAL_JUDGE_BASE_URL' : 'EVAL_BASE_URL';
  const baseUrl = env[baseUrlVariable];
  if (!baseUrl) {
    throw new Error(`The custom provider needs a base URL: set ${baseUrlVariable}`);
  }
  return { provider, model, apiKey, baseUrl };
}

/**
 * The grader (JEF-470). Only ever from `EVAL_JUDGE_*`: it never borrows the
 * model under test or its key, because a grader that changes with the target
 * makes the scores incomparable.
 */
function parseJudge(env: Env): EvalTarget | null {
  if (!env.EVAL_JUDGE_PROVIDER) return null;
  const spec = env.EVAL_JUDGE_MODEL
    ? `${env.EVAL_JUDGE_PROVIDER}:${env.EVAL_JUDGE_MODEL}`
    : env.EVAL_JUDGE_PROVIDER;
  return parseTarget(spec, env, JUDGE_KEY_VARIABLES);
}

/**
 * The Langfuse project the run is uploaded to (JEF-550). Read only for
 * `--publish`, and only from `EVAL_LANGFUSE_*`: these are their own
 * credentials, so a leaked eval key reaches the eval project and nothing else.
 * A missing one fails here, before the first paid call.
 */
function parseLangfuse(env: Env, flag = '--publish'): LangfuseConfig {
  const publicKey = env.EVAL_LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = env.EVAL_LANGFUSE_SECRET_KEY?.trim();
  if (!publicKey)
    throw new Error(`${flag} needs a Langfuse public key: set EVAL_LANGFUSE_PUBLIC_KEY`);
  if (!secretKey)
    throw new Error(`${flag} needs a Langfuse secret key: set EVAL_LANGFUSE_SECRET_KEY`);

  const baseUrl = env.EVAL_LANGFUSE_BASE_URL?.trim() || LANGFUSE.DEFAULT_BASE_URL;
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error(`EVAL_LANGFUSE_BASE_URL must start with http:// or https://, got "${baseUrl}"`);
  }
  return { publicKey, secretKey, baseUrl: baseUrl.replace(/\/+$/, '') };
}

function parseRate(
  raw: string | null | undefined,
  fallback: number,
  name: '--min-pass-rate' | '--max-error-rate',
): number {
  if (raw === null || raw === undefined) return fallback;
  const value = raw.trim() === '' ? Number.NaN : Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a number from 0 to 1, got "${raw}"`);
  }
  return value;
}

/**
 * What `--publish-from` and `--show` cannot be combined with: they run
 * nothing, so each of these would be ignored. `--show` keeps `--case`, which
 * picks the cases to print.
 */
function conflictsWithSavedRun(flags: RawFlags, keepCase: boolean): string[] {
  return [
    flags.targets.length > 0 && '--target',
    !keepCase && flags.cases.length > 0 && '--case',
    flags.cache && '--cache',
    flags.refresh && '--refresh',
    flags.publish && '--publish',
    flags.validateJudge && '--validate-judge',
    flags.out !== null && '--out',
    flags.label !== null && '--label',
    flags.noSave && '--no-save',
    flags.minPassRate !== null && '--min-pass-rate',
    flags.maxErrorRate !== null && '--max-error-rate',
  ].filter((flag): flag is string => flag !== false);
}

/**
 * `--publish-from <run-dir>` (JEF-562): no target, judge or provider variable
 * is read, only the Langfuse keys, so a saved run can be uploaded without any
 * model credentials on the machine.
 */
function parsePublishFrom(flags: RawFlags, env: Env): EvalConfig {
  const conflicts = conflictsWithSavedRun(flags, false);
  if (conflicts.length > 0) {
    throw new Error(`--publish-from cannot be used with ${conflicts.join(', ')}`);
  }
  return {
    targets: [],
    judge: null,
    validateJudge: false,
    caseIds: [],
    cache: false,
    refresh: false,
    minPassRate: DEFAULT_MIN_PASS_RATE,
    maxErrorRate: DEFAULT_MAX_ERROR_RATE,
    reportFile: null,
    publish: null,
    publishFrom: {
      dir: flags.publishFrom as string,
      langfuse: parseLangfuse(env, '--publish-from'),
      force: flags.force,
    },
    show: null,
    label: null,
    save: false,
  };
}

/** `--show <run-dir>`: prints a saved run's transcripts. Reads no credential at all. */
function parseShow(flags: RawFlags): EvalConfig {
  const conflicts = [
    ...(flags.publishFrom !== null ? ['--publish-from'] : []),
    ...(flags.force ? ['--force'] : []),
    ...conflictsWithSavedRun(flags, true),
  ];
  if (conflicts.length > 0) {
    throw new Error(`--show cannot be used with ${conflicts.join(', ')}`);
  }
  return {
    targets: [],
    judge: null,
    validateJudge: false,
    caseIds: splitCaseIds(flags.cases),
    cache: false,
    refresh: false,
    minPassRate: DEFAULT_MIN_PASS_RATE,
    maxErrorRate: DEFAULT_MAX_ERROR_RATE,
    reportFile: null,
    publish: null,
    publishFrom: null,
    show: flags.show as string,
    label: null,
    save: false,
  };
}

function splitCaseIds(values: string[]): string[] {
  return values
    .flatMap((value) => value.split(','))
    .map((id) => id.trim())
    .filter((id) => id !== '');
}

/**
 * Reads the command line and environment into a run configuration, or throws
 * a message that says what to change. Everything is checked before the first
 * model call, because a typo found after twenty paid requests is a poor way
 * to learn about it.
 */
export function parseEvalArgs(argv: string[], env: Env): EvalConfig {
  const flags = readFlags(argv);

  if (flags.show !== null) return parseShow(flags);
  if (flags.publishFrom !== null) return parsePublishFrom(flags, env);
  if (flags.force) throw new Error('--force only goes with --publish-from');

  const fromEnv = env.EVAL_PROVIDER
    ? [env.EVAL_MODEL ? `${env.EVAL_PROVIDER}:${env.EVAL_MODEL}` : env.EVAL_PROVIDER]
    : [];
  const specs = flags.targets.length > 0 ? flags.targets : fromEnv;
  if (specs.length === 0 && !flags.validateJudge) {
    throw new Error('No target: pass --target <provider[:model]> or set EVAL_PROVIDER');
  }

  const judge = parseJudge(env);
  if (flags.validateJudge && !judge) {
    throw new Error(
      '--validate-judge needs a judge: set EVAL_JUDGE_PROVIDER, EVAL_JUDGE_MODEL and EVAL_JUDGE_API_KEY',
    );
  }

  return {
    targets: specs.map((spec) => parseTarget(spec, env)),
    judge,
    validateJudge: flags.validateJudge,
    caseIds: splitCaseIds(flags.cases),
    cache: flags.cache || flags.refresh,
    refresh: flags.refresh,
    minPassRate: parseRate(
      flags.minPassRate ?? env.EVAL_MIN_PASS_RATE,
      DEFAULT_MIN_PASS_RATE,
      '--min-pass-rate',
    ),
    maxErrorRate: parseRate(
      flags.maxErrorRate ?? env.EVAL_MAX_ERROR_RATE,
      DEFAULT_MAX_ERROR_RATE,
      '--max-error-rate',
    ),
    reportFile: flags.out,
    // A judge validation run has no targets to upload (JEF-550: not in this cut).
    publish: flags.publish && !flags.validateJudge ? parseLangfuse(env) : null,
    publishFrom: null,
    show: null,
    label: flags.label?.trim() || null,
    save: !flags.noSave,
  };
}
