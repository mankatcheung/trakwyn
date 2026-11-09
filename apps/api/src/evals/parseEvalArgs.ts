import { LLM_PROVIDER } from '#src/use-cases/constants.js';
import { PLATFORM_LLM } from '#src/infrastructure/config/constants.js';
import { WORKERS_AI_PROVIDER, type EvalConfig, type EvalTarget } from '#src/evals/types.js';

type Env = Readonly<Record<string, string | undefined>>;

const DEFAULT_MIN_PASS_RATE = 0.8;
const VALUE_FLAGS = ['--target', '--case', '--min-pass-rate', '--out'] as const;
const SWITCH_FLAGS = ['--cache', '--refresh', '--validate-judge'] as const;
const SWITCH_KEYS = {
  '--cache': 'cache',
  '--refresh': 'refresh',
  '--validate-judge': 'validateJudge',
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
  out: string | null;
  cache: boolean;
  refresh: boolean;
  validateJudge: boolean;
}

function readFlags(argv: string[]): RawFlags {
  let flags: RawFlags = {
    targets: [],
    cases: [],
    minPassRate: null,
    out: null,
    cache: false,
    refresh: false,
    validateJudge: false,
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

function parseMinPassRate(raw: string | null | undefined): number {
  if (raw === null || raw === undefined) return DEFAULT_MIN_PASS_RATE;
  const value = raw.trim() === '' ? Number.NaN : Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`--min-pass-rate must be a number from 0 to 1, got "${raw}"`);
  }
  return value;
}

/**
 * Reads the command line and environment into a run configuration, or throws
 * a message that says what to change. Everything is checked before the first
 * model call, because a typo found after twenty paid requests is a poor way
 * to learn about it.
 */
export function parseEvalArgs(argv: string[], env: Env): EvalConfig {
  const flags = readFlags(argv);

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
    caseIds: flags.cases
      .flatMap((value) => value.split(','))
      .map((id) => id.trim())
      .filter((id) => id !== ''),
    cache: flags.cache || flags.refresh,
    refresh: flags.refresh,
    minPassRate: parseMinPassRate(flags.minPassRate ?? env.EVAL_MIN_PASS_RATE),
    reportFile: flags.out,
  };
}
