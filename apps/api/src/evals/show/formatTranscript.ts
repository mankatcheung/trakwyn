import type { TargetRun } from '#src/evals/summary.js';
import type { CaseResult, RecordedCall } from '#src/evals/types.js';
import type { LLMMessage } from '#src/use-cases/ports/ILLMProvider.js';

const INDENT = '    ';

const indent = (text: string, prefix = INDENT): string =>
  text
    .split('\n')
    .map((line) => (line === '' ? line : `${prefix}${line}`))
    .join('\n');

function formatMessage(message: LLMMessage): string {
  const role =
    message.role === 'tool' && message.toolCallId ? `tool ${message.toolCallId}` : message.role;
  const lines = [`  [${role}]`];
  if (message.content !== '') lines.push(indent(message.content));
  for (const call of message.toolCalls ?? []) {
    lines.push(indent(`-> ${call.name}(${JSON.stringify(call.arguments)})  [${call.id}]`));
  }
  return lines.join('\n');
}

function formatCall(call: RecordedCall, label: string): string {
  const header = `${label} (${call.kind}, ${Math.round(call.latencyMs)} ms, ${call.promptTokens} in / ${call.completionTokens} out, ${new Date(call.startedAt).toISOString()})`;
  const lines = [header, ...call.messages.map(formatMessage)];
  if (call.output !== null) lines.push('  [reply]', indent(call.output));
  for (const toolCall of call.toolCalls) {
    lines.push(
      indent(`-> ${toolCall.name}(${JSON.stringify(toolCall.arguments)})  [${toolCall.id}]`, '  '),
    );
  }
  if (call.error !== null) lines.push(`  [error] ${call.error}`);
  return lines.join('\n');
}

function formatCase(result: CaseResult): string {
  const lines = [
    `--- ${result.caseId} · ${result.feature} · ${result.outcome.toUpperCase()} ---`,
    `prompt ${result.prompt} · ${Math.round(result.latencyMs)} ms · ${result.promptTokens} in / ${result.completionTokens} out` +
      (result.judgePromptTokens + result.judgeCompletionTokens > 0
        ? ` · judge ${result.judgePromptTokens} in / ${result.judgeCompletionTokens} out`
        : '') +
      (result.feature === 'chat'
        ? ` · ${result.toolCalls} tool calls, ${result.iterations} iterations`
        : ''),
  ];
  if (result.failures.length > 0) {
    lines.push(
      result.outcome === 'error' ? 'Errors:' : 'Failures:',
      ...result.failures.map((reason) => `  - ${reason}`),
    );
  }
  result.calls.forEach((call, index) => {
    lines.push('', formatCall(call, `Model call ${index + 1} of ${result.calls.length}`));
  });
  result.judgeCalls.forEach((call, index) => {
    lines.push('', formatCall(call, `Judge call ${index + 1} of ${result.judgeCalls.length}`));
  });
  if (result.calls.length === 0 && result.judgeCalls.length === 0) {
    lines.push('', '(no model call was recorded)');
  }
  return lines.join('\n');
}

/** The ids in `caseIds` that no target ran, so a typo is reported instead of printing nothing. */
export function unknownCaseIds(runs: readonly TargetRun[], caseIds: readonly string[]): string[] {
  const known = new Set(runs.flatMap((run) => run.results.map((result) => result.caseId)));
  return caseIds.filter((id) => !known.has(id));
}

/**
 * A saved run's transcripts as plain text: one section per target,
 * then one per case with its failures and every model and judge call, in
 * order. `caseIds` empty means every case.
 */
export function formatTranscript(runs: readonly TargetRun[], caseIds: readonly string[]): string {
  return runs
    .map((run) => {
      const results = run.results.filter(
        (result) => caseIds.length === 0 || caseIds.includes(result.caseId),
      );
      const heading = `===== ${run.label} (${results.length} of ${run.results.length} cases) =====`;
      return [heading, ...results.map(formatCase)].join('\n\n');
    })
    .join('\n\n');
}
