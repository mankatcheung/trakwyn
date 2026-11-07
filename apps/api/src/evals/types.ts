import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';

/** The AI features the eval covers. Add one here when a new feature gets cases. */
export type EvalFeature = 'jobDescription' | 'resumeMatch' | 'resume' | 'coverLetter';

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

export interface CaseResult {
  caseId: string;
  feature: EvalFeature;
  /** The prompt and version the case ran against, as `id@version` (JEF-505). */
  prompt: string;
  passed: boolean;
  /** False only when the reply could not be read as the JSON the prompt asks for. */
  schemaValid: boolean;
  failures: string[];
  promptTokens: number;
  completionTokens: number;
  /** What the grader spent on this case, apart from the model under test (JEF-470). */
  judgePromptTokens: number;
  judgeCompletionTokens: number;
  latencyMs: number;
}

/** One provider/model to run every case against. */
export interface EvalTarget {
  provider: string;
  model: string | null;
  apiKey: string;
  baseUrl: string | null;
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
  /** Share of cases that must pass, per target, for the run to exit 0. */
  minPassRate: number;
}
