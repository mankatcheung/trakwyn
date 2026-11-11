import { LangfuseClient, type Evaluation } from '@langfuse/client';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { startObservation } from '@langfuse/tracing';
import { NodeSDK } from '@opentelemetry/sdk-node';
import type {
  DatasetItemInput,
  LangfuseGateway,
  RunInput,
  RunItemInput,
} from '#src/evals/publish/langfusePublisher.js';
import type { LangfuseConfig, RecordedCall } from '#src/evals/types.js';

/**
 * The one place that imports the Langfuse SDK (JEF-550), and only for
 * `pnpm eval --publish`: no request path reaches it (`dependencyRule.test.ts`
 * keeps `use-cases/` and the layers inward of `infrastructure/` clear of
 * frameworks, and the SDK is a devDependency).
 *
 * The cases already ran, so there is nothing to trace live. Each case is
 * "replayed" inside `experiment.run`: the task opens a generation per recorded
 * call, with its original start time and duration, and returns the reply. The
 * SDK links that trace to the dataset item and the run.
 */

export interface PublishSession {
  gateway: LangfuseGateway;
  /** Flushes buffered spans and stops the exporter. Call it once, even after a failure. */
  close(): Promise<void>;
}

const toGeneration = (call: RecordedCall, model: string, name: string) => {
  const generation = startObservation(
    name,
    {
      model,
      input: call.messages,
      output:
        call.toolCalls.length > 0
          ? { content: call.output, toolCalls: call.toolCalls }
          : call.output,
      usageDetails: { input: call.promptTokens, output: call.completionTokens },
      level: call.error === null ? 'DEFAULT' : 'ERROR',
      ...(call.error === null ? {} : { statusMessage: call.error }),
      metadata: { kind: call.kind },
    },
    { asType: 'generation', startTime: new Date(call.startedAt) },
  );
  generation.end(new Date(call.startedAt + call.latencyMs));
};

function replay(item: RunItemInput, run: RunInput): string | null {
  item.calls.forEach((call) => toGeneration(call, run.model, 'model-call'));
  item.judgeCalls.forEach((call) => toGeneration(call, run.judgeModel ?? 'judge', 'judge-call'));
  return item.output;
}

const evaluationsOf = (item: RunItemInput): Evaluation[] =>
  item.scores.map((score) => ({
    name: score.name,
    // Langfuse stores a boolean score as 1 or 0 with the BOOLEAN data type.
    value: typeof score.value === 'boolean' ? Number(score.value) : score.value,
    dataType: score.dataType,
    ...(score.comment === undefined ? {} : { comment: score.comment }),
  }));

export function createLangfuseSession(config: LangfuseConfig): PublishSession {
  const processor = new LangfuseSpanProcessor({
    publicKey: config.publicKey,
    secretKey: config.secretKey,
    baseUrl: config.baseUrl,
  });
  const sdk = new NodeSDK({ spanProcessors: [processor] });
  sdk.start();
  const client = new LangfuseClient({
    publicKey: config.publicKey,
    secretKey: config.secretKey,
    baseUrl: config.baseUrl,
  });

  const gateway: LangfuseGateway = {
    async upsertDataset(name) {
      // Creating a dataset that exists returns it, so this is an upsert.
      await client.api.datasets.create({
        name,
        description: 'Trakwyn AI eval cases (apps/api/src/evals). Fixtures are invented.',
      });
    },
    async upsertItems(datasetName, items: DatasetItemInput[]) {
      for (const item of items) {
        await client.api.datasetItems.create({
          datasetName,
          id: item.id,
          input: item.input,
          metadata: item.metadata,
        });
      }
    },
    async runExperiment(run) {
      const dataset = await client.dataset.get(run.datasetName);
      const datasetItems = new Map(dataset.items.map((entry) => [entry.id, entry]));
      let url: string | null = null;

      // One call per case, all under the same run name: the SDK joins them into
      // one dataset run, and each call's evaluator then knows its own case.
      for (const item of run.items) {
        const datasetItem = datasetItems.get(item.caseId);
        if (!datasetItem) throw new Error(`Dataset item ${item.caseId} is missing in Langfuse`);
        const result = await client.experiment.run({
          name: run.runName,
          runName: run.runName,
          description: run.description,
          metadata: run.metadata,
          data: [datasetItem],
          maxConcurrency: 1,
          task: async () => replay(item, run),
          evaluators: [async () => evaluationsOf(item)],
        });
        url = url ?? result.experimentUrl ?? null;
      }
      return { url };
    },
  };

  return {
    gateway,
    close: async () => {
      await client.flush();
      await processor.forceFlush();
      await sdk.shutdown();
    },
  };
}
