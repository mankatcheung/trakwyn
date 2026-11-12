import type { ChatScript } from '#src/evals/chatScript.js';
import type { ILLMProvider, LLMMessage, LLMToolCall } from '#src/use-cases/ports/ILLMProvider.js';

/** The AI features the eval covers. Add one here when a new feature gets cases. */
export type EvalFeature =
  'jobDescription' | 'resumeMatch' | 'resume' | 'coverLetter' | 'chat' | 'briefing';

/** Features whose output is graded by a second model, so a case needs a judge. */
export const JUDGED_FEATURES: readonly EvalFeature[] = ['resume', 'coverLetter'];

/**
 * One scored scenario. `run` drives the real use case against `provider` and
 * returns the reasons the output was wrong, or an empty list when it was
 * fine. It throws what the use case throws (an unparseable reply, a provider
 * error); `runCase` turns that into a failed result instead of ending the run.
 * `judge` is the fixed grader model (JEF-470); only cases of a judged feature
 * read it, and it is metered apart from `provider`.
 */
export interface EvalCase {
  id: string;
  feature: EvalFeature;
  /**
   * The reply a good model would give. Never sent anywhere: the tests feed it
   * to the case's own checks to prove they can be satisfied, which is what
   * stops a mistyped expectation from failing every model forever.
   */
  idealReply: string;
  run(provider: ILLMProvider, judge?: ILLMProvider): Promise<string[]>;
}

/**
 * A chat case (JEF-471). It is scripted rather than answered with one reply,
 * so besides the reply it carries what a good model does round by round
 * (`idealTrace`) and wrong behaviour its checks must catch (`badTraces`).
 */
export interface ChatEvalCase extends EvalCase {
  feature: 'chat';
  idealTrace: ChatScript;
  badTraces: ChatScript[];
}

/**
 * One call the model (or the judge) received during a case (JEF-550): what it
 * was sent, what it answered, and what that cost. Kept so a run can be
 * published to Langfuse and read there; the printed report does not use it.
 */
export interface RecordedCall {
  /** `complete` is one request and reply; `stream` is one iteration of the chat tool loop. */
  kind: 'complete' | 'stream';
  messages: LLMMessage[];
  /** The reply text, or null when the model only asked for tools, or the call failed. */
  output: string | null;
  toolCalls: LLMToolCall[];
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  /** Epoch milliseconds when the call began. */
  startedAt: number;
  /** The error message when the call threw, otherwise null. */
  error: string | null;
}

/**
 * What a case came to (JEF-559). `fail` is the model's (a wrong answer, an
 * unreadable or truncated reply, a leaked tool call); `error` is the
 * provider's or the harness's (HTTP 429, a quota stop, a judge outage);
 * `skipped` was never run. Only `pass` and `fail` are scored.
 */
export type CaseOutcome = 'pass' | 'fail' | 'error' | 'skipped';

export interface CaseResult {
  caseId: string;
  feature: EvalFeature;
  /** The prompt and version the case ran against, as `id@version` (JEF-505). */
  prompt: string;
  outcome: CaseOutcome;
  /** `outcome === 'pass'`, kept for readers written before outcomes. */
  passed: boolean;
  /** False only when the reply could not be read as the JSON the prompt asks for. */
  schemaValid: boolean;
  failures: string[];
  /**
   * True when the provider's daily quota ran out on this case (JEF-556). The
   * rest of that target's cases are not run, and the result is no score.
   */
  quotaStop?: boolean;
  promptTokens: number;
  completionTokens: number;
  /** What the grader spent on this case, apart from the model under test (JEF-470). */
  judgePromptTokens: number;
  judgeCompletionTokens: number;
  latencyMs: number;
  /** Tool calls the model made, and how many times it was asked (loop iterations). Zero outside chat. */
  toolCalls: number;
  iterations: number;
  /** Every call the model under test received, in order (JEF-550). */
  calls: RecordedCall[];
  /** Every call the judge received, in order (JEF-550). */
  judgeCalls: RecordedCall[];
}

/**
 * Workers AI built the way hosted AI builds it (JEF-540): same adapter, same
 * reasoning fields, direct to Cloudflare with no gateway headers. Not a user
 * provider, so it is not in `LLM_PROVIDER`.
 */
export const WORKERS_AI_PROVIDER = 'workersai';

/** One provider/model to run every case against. */
export interface EvalTarget {
  provider: string;
  model: string | null;
  apiKey: string;
  baseUrl: string | null;
}

/**
 * Where `--publish` sends a run (JEF-550). The keys are the project's own and
 * read only from `EVAL_LANGFUSE_*`, never from a variable the app uses.
 */
export interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
}

/** `--publish-from` (JEF-562): upload a saved run folder, with no target, judge or provider. */
export interface PublishFromConfig {
  dir: string;
  langfuse: LangfuseConfig;
  /** Upload even though the folder says it was already published. */
  force: boolean;
}

export interface EvalConfig {
  targets: EvalTarget[];
  /**
   * The grader (`EVAL_JUDGE_*`), never defaulted to a target: scores are only
   * comparable across targets when one fixed model grades them all.
   */
  judge: EvalTarget | null;
  /** Only grade the judge against the hand-labelled outputs, then stop. */
  validateJudge: boolean;
  /** Empty means every case. */
  caseIds: string[];
  /** Keep raw replies on disk and reuse them on the next run. */
  cache: boolean;
  /** With `cache`: ignore what is stored and overwrite it. */
  refresh: boolean;
  /** Share of the cases that ran that must pass, per target, for the run to exit 0. */
  minPassRate: number;
  /** Share of a target's cases that may end in `error` before the target is untrusted (JEF-559). */
  maxErrorRate: number;
  /** Where to also write the final report, or null to only print it. */
  reportFile: string | null;
  /** Where to upload the run once it finishes (`--publish`), or null to not upload. */
  publish: LangfuseConfig | null;
  /** Set by `--publish-from`: the run is read from a folder and nothing else is configured. */
  publishFrom: PublishFromConfig | null;
  /** A name added to the run folder (`--label`), or null. */
  label: string | null;
  /** Keep the run in its own folder (JEF-560); `--no-save` turns it off. */
  save: boolean;
}
