import { LLM_PROVIDER } from '#src/use-cases/constants.js';
import type { EvalConfig, EvalTarget } from '#src/evals/types.js';

type Env = Readonly<Record<string, string | undefined>>;

const DEFAULT_MIN_PASS_RATE = 0.8;
const VALUE_FLAGS = ['--target', '--case', '--min-pass-rate'] as const;
const SWITCH_FLAGS = ['--cache', '--refresh'] as const;
const PROVIDERS: string[] = Object.values(LLM_PROVIDER);

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
  cache: boolean;
  refresh: boolean;
}

function readFlags(argv: string[]): RawFlags {
  let flags: RawFlags = { targets: [], cases: [], minPassRate: null, cache: false, refresh: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;

    if (isSwitchFlag(arg)) {
      flags = { ...flags, [arg === '--cache' ? 'cache' : 'refresh']: true };
    } else if (isValueFlag(arg)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} needs a value`);
      }
      index += 1;
      if (arg === '--target') flags = { ...flags, targets: [...flags.targets, value] };
      else if (arg === '--case') flags = { ...flags, cases: [...flags.cases, value] };
      else flags = { ...flags, minPassRate: value };
    } else {
      throw new Error(`Unknown option ${arg}`);
    }
  }

  return flags;
}

function parseTarget(spec: string, env: Env): EvalTarget {
  // The first colon only: model names such as `anthropic/claude:beta` carry their own.
  const colon = spec.indexOf(':');
  const provider = colon === -1 ? spec : spec.slice(0, colon);
  const model = colon === -1 ? '' : spec.slice(colon + 1);

  if (!PROVIDERS.includes(provider)) {
    throw new Error(`Unknown provider "${provider}"; expected one of: ${PROVIDERS.join(', ')}`);
  }

  const keyVariable = `EVAL_API_KEY_${provider.toUpperCase()}`;
  const apiKey = env[keyVariable] || env.EVAL_API_KEY;
  if (!apiKey) {
    throw new Error(`No API key for "${provider}": set ${keyVariable} or EVAL_API_KEY`);
  }

  if (provider !== LLM_PROVIDER.CUSTOM) {
    return { provider, model: model || null, apiKey, baseUrl: null };
  }
  if (!model) {
    throw new Error('The custom provider needs a model: --target custom:<model>');
  }
  if (!env.EVAL_BASE_URL) {
    throw new Error('The custom provider needs a base URL: set EVAL_BASE_URL');
  }
  return { provider, model, apiKey, baseUrl: env.EVAL_BASE_URL };
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
  if (specs.length === 0) {
    throw new Error('No target: pass --target <provider[:model]> or set EVAL_PROVIDER');
  }

  return {
    targets: specs.map((spec) => parseTarget(spec, env)),
    caseIds: flags.cases
      .flatMap((value) => value.split(','))
      .map((id) => id.trim())
      .filter((id) => id !== ''),
    cache: flags.cache || flags.refresh,
    refresh: flags.refresh,
    minPassRate: parseMinPassRate(flags.minPassRate ?? env.EVAL_MIN_PASS_RATE),
  };
}
