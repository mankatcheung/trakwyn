import { context, trace, SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api';

import { AXIOM, SECURITY_EVENTS, TRACING } from '#src/infrastructure/config/constants.js';
import { otelMetrics, type IMetrics } from '#src/infrastructure/observability/metrics.js';
import { DomainError } from '#src/use-cases/errors/DomainError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type {
  IToolCallObserver,
  ToolCallMeta,
  ToolCallOutcome,
  ToolCallRecorder,
} from '#src/use-cases/ports/IToolCallObserver.js';

/** The two fields of a catalogue entry the observer reads. */
export interface ObservedTool {
  name: string;
  access: 'read' | 'write';
}

interface Deps {
  /** The tool catalogue: the source of each tool's `access` tag, and the set of names worth recording. */
  tools: readonly ObservedTool[];
  logger: ILogger;
  metrics?: IMetrics;
  /**
   * Whether to open a span per call. Off in dev and test, where the tracer
   * is a no-op anyway, so the result is never serialised just to be measured.
   * The refusal log and the counters are kept either way, the same as
   * `InstrumentedRateLimiter`.
   */
  tracing: boolean;
}

/** How one call ended, filled in by the recorder or by a throw. */
interface Settlement {
  outcome: ToolCallOutcome;
  resultBytes?: number;
  error?: unknown;
}

/**
 * OpenTelemetry-backed `IToolCallObserver` (JEF-365): one span per MCP or chat
 * tool call, a `trakwyn.tool.calls` count by outcome, and a `warn` line plus a
 * counter when a token's scope refuses a tool.
 *
 * **Nothing about a call's content is recorded.** Arguments carry
 * application ids and free text, and a result is the user's own records, so
 * a span holds the tool, its access tag, the surface, the outcome and the
 * result's size. That is the same rule as `traceUseCase`.
 */
export class ToolCallObserver implements IToolCallObserver {
  private readonly accessByName: ReadonlyMap<string, ObservedTool['access']>;
  private readonly logger: ILogger;
  private readonly metrics: IMetrics;
  private readonly tracing: boolean;

  constructor({ tools, logger, metrics = otelMetrics, tracing }: Deps) {
    this.accessByName = new Map(tools.map((tool) => [tool.name, tool.access]));
    this.logger = logger;
    this.metrics = metrics;
    this.tracing = tracing;
  }

  async observe<T>(meta: ToolCallMeta, run: (call: ToolCallRecorder) => Promise<T>): Promise<T> {
    // An MCP client can send any tool name it likes. Only a catalogue name
    // reaches a span name or a metric label, so a client cannot create
    // either by inventing names.
    const access = this.accessByName.get(meta.name);
    const tool = access ? meta.name : TRACING.UNKNOWN_TOOL;
    const settlement: Settlement = { outcome: 'ok' };
    const span = this.tracing ? this.startSpan(meta, tool, access) : undefined;

    try {
      const recorder = this.recorderFor(meta, tool, settlement, span !== undefined);
      return await (span
        ? context.with(trace.setSpan(context.active(), span), () => run(recorder))
        : run(recorder));
    } catch (error) {
      settle(settlement, classify(error), error);
      throw error;
    } finally {
      if (span) endSpan(span, settlement);
      this.metrics.recordToolCall(meta.surface, tool, settlement.outcome);
    }
  }

  private startSpan(meta: ToolCallMeta, tool: string, access: ObservedTool['access'] | undefined) {
    const attributes: Attributes = {
      [TRACING.TOOL_NAME_ATTRIBUTE]: tool,
      [TRACING.TOOL_ACCESS_ATTRIBUTE]: access ?? TRACING.UNKNOWN_TOOL,
      [TRACING.TOOL_SURFACE_ATTRIBUTE]: meta.surface,
    };
    if (meta.tokenScope) attributes[TRACING.MCP_TOKEN_SCOPE_ATTRIBUTE] = meta.tokenScope;
    return trace
      .getTracer(AXIOM.SERVICE_NAME)
      .startSpan(`${meta.surface}${TRACING.TOOL_SPAN_SUFFIX} ${tool}`, { attributes });
  }

  private recorderFor(
    meta: ToolCallMeta,
    tool: string,
    settlement: Settlement,
    measure: boolean,
  ): ToolCallRecorder {
    return {
      succeeded: (result) => {
        settlement.outcome = 'ok';
        if (measure) settlement.resultBytes = serialisedBytes(result);
      },
      failed: (error) => settle(settlement, classify(error), error),
      invalidParams: () => {
        settlement.outcome = 'invalid_params';
      },
      refused: (userId) => {
        settlement.outcome = 'refused';
        // No `err`: nothing was thrown, the scope check refused on purpose.
        // A token probing write tools shows up as a run of these (JEF-354).
        this.logger.warn('MCP tool refused for token scope', undefined, {
          event: SECURITY_EVENTS.MCP_TOOL_REFUSED,
          userId,
          tool,
          scope: meta.tokenScope,
        });
        if (meta.tokenScope) this.metrics.recordMcpToolRefused(tool, meta.tokenScope);
      },
    };
  }
}

function settle(settlement: Settlement, outcome: ToolCallOutcome, error: unknown): void {
  settlement.outcome = outcome;
  settlement.error = error;
}

/**
 * A `ValidationError` means the model or client sent something unusable, so
 * it is `invalid_params` like the controller's own argument checks. Any
 * other `DomainError` is a failure the caller can act on, and anything that
 * is not a `DomainError` is a bug or an outage.
 */
function classify(error: unknown): ToolCallOutcome {
  if (!(error instanceof DomainError)) return 'internal_error';
  return error.code === ERROR_CODES.VALIDATION ? 'invalid_params' : 'domain_error';
}

function endSpan(span: Span, { outcome, resultBytes, error }: Settlement): void {
  span.setAttribute(TRACING.TOOL_OUTCOME_ATTRIBUTE, outcome);
  if (resultBytes !== undefined)
    span.setAttribute(TRACING.TOOL_RESULT_BYTES_ATTRIBUTE, resultBytes);
  if (error instanceof DomainError) span.setAttribute(TRACING.ERROR_CODE_ATTRIBUTE, error.code);
  // Only an internal error marks the span failed. A domain error is the
  // tool working as intended ("Application not found"), and flagging it
  // would bury the real faults among them.
  if (outcome === 'internal_error') {
    if (error instanceof Error) span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  span.end();
}

/** UTF-8 bytes of the result as sent. MCP hands over its text already serialised. */
function serialisedBytes(result: unknown): number {
  const text = typeof result === 'string' ? result : (JSON.stringify(result) ?? '');
  return Buffer.byteLength(text, 'utf8');
}
