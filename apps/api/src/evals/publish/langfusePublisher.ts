import { LANGFUSE } from '#src/infrastructure/config/constants.js';
import type { TargetRun } from '#src/evals/summary.js';
import type { CaseResult, RecordedCall } from '#src/evals/types.js';

/**
 * Turns finished runs into what Langfuse shows (JEF-550): one dataset of the
 * cases, and per target one dataset run whose items are the cases, each with
 * its calls and scores. This file only decides what to send; `LangfuseGateway`
 * is the seam to the SDK (`langfuseGateway.ts`), so a test can use a fake and
 * nothing outside `src/evals/` imports the SDK.
 */

export interface DatasetItemInput {
  /** The case id: stable across runs, so a later run lands on the same item. */
  id: string;
  /** What the case was sent: the messages of its first call to the model. */
  input: unknown;
  metadata: { feature: string; prompt: string };
}

export interface ScoreInput {
  name: string;
  value: number | boolean;
  dataType: 'BOOLEAN' | 'NUMERIC';
  comment?: string | undefined;
}

export interface RunItemInput {
  caseId: string;
  /** The last reply the model gave that was not an error, or null. */
  output: string | null;
  calls: RecordedCall[];
  judgeCalls: RecordedCall[];
  scores: ScoreInput[];
}

export interface RunInput {
  datasetName: string;
  runName: string;
  description: string;
  /** The target (`provider:model`) the model calls are attributed to. */
  model: string;
  /** The judge's label, or null when the run had none. */
  judgeModel: string | null;
  metadata: Record<string, string | number | null>;
  items: RunItemInput[];
}

export interface LangfuseGateway {
  upsertDataset(name: string): Promise<void>;
  upsertItems(datasetName: string, items: DatasetItemInput[]): Promise<void>;
  /** Records the run, replaying each item's calls as a trace linked to its dataset item. */
  runExperiment(run: RunInput): Promise<{ url: string | null }>;
}

export interface RunMetadata {
  /** The short git SHA the run was made from, or `unknown`. */
  commit: string;
  startedAt: Date;
  /** The judge's label (`provider:model`), or null when the run used none. */
  judge: string | null;
}

export interface PublishedRun {
  label: string;
  url: string | null;
}

/** `openai:gpt-x @ abc1234 @ 2026-11-11T22-30-00Z`: no colons in the time, so it reads as one token. */
export function buildRunName(label: string, meta: RunMetadata): string {
  const stamp = meta.startedAt
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replace(/:/g, '-');
  return `${label} @ ${meta.commit} @ ${stamp}`;
}

const firstPrompt = (result: CaseResult): unknown =>
  result.calls[0]?.messages ?? { caseId: result.caseId };

function lastReply(calls: RecordedCall[]): string | null {
  const replied = calls.filter((call) => call.error === null && call.output !== null);
  return replied[replied.length - 1]?.output ?? null;
}

function scoresFor(result: CaseResult): ScoreInput[] {
  const failures = result.failures.join('\n');
  const base: ScoreInput[] = [
    {
      name: 'passed',
      value: result.passed,
      dataType: 'BOOLEAN',
      comment: failures === '' ? undefined : failures,
    },
    { name: 'schema_valid', value: result.schemaValid, dataType: 'BOOLEAN' },
  ];
  if (result.feature !== 'chat') return base;
  return [
    ...base,
    { name: 'tool_calls', value: result.toolCalls, dataType: 'NUMERIC' },
    { name: 'iterations', value: result.iterations, dataType: 'NUMERIC' },
  ];
}

function itemsOf(runs: TargetRun[]): DatasetItemInput[] {
  const seen = new Map<string, DatasetItemInput>();
  for (const result of runs.flatMap((run) => run.results)) {
    if (seen.has(result.caseId)) continue;
    seen.set(result.caseId, {
      id: result.caseId,
      input: firstPrompt(result),
      metadata: { feature: result.feature, prompt: result.prompt },
    });
  }
  return [...seen.values()];
}

function runInput(run: TargetRun, meta: RunMetadata): RunInput {
  return {
    datasetName: LANGFUSE.DATASET_NAME,
    runName: buildRunName(run.label, meta),
    description: `Eval run of ${run.label} at ${meta.commit}`,
    model: run.label,
    judgeModel: meta.judge,
    metadata: {
      target: run.label,
      judge: meta.judge,
      commit: meta.commit,
      // Cache hits are replays, so their latency says nothing about the model.
      cacheHits: run.cache?.hits ?? null,
      cacheMisses: run.cache?.misses ?? null,
    },
    items: run.results.map((result) => ({
      caseId: result.caseId,
      output: lastReply(result.calls),
      calls: result.calls,
      judgeCalls: result.judgeCalls,
      scores: scoresFor(result),
    })),
  };
}

/**
 * Uploads every target's run. Throws what the gateway throws: the caller
 * (`runEvals`) logs it and keeps the exit code, since the report is already
 * printed and a Langfuse outage says nothing about the prompts.
 */
export async function publishRuns(
  gateway: LangfuseGateway,
  runs: TargetRun[],
  meta: RunMetadata,
): Promise<PublishedRun[]> {
  const withResults = runs.filter((run) => run.results.length > 0);
  if (withResults.length === 0) return [];

  await gateway.upsertDataset(LANGFUSE.DATASET_NAME);
  await gateway.upsertItems(LANGFUSE.DATASET_NAME, itemsOf(withResults));

  const published: PublishedRun[] = [];
  for (const run of withResults) {
    const { url } = await gateway.runExperiment(runInput(run, meta));
    published.push({ label: run.label, url });
  }
  return published;
}
