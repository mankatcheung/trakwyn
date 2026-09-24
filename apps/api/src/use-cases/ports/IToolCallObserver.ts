import type { ApiTokenScope } from '#src/domain/apiToken/ApiToken.js';

/** Which surface a tool was called through: an MCP client, or the in-app chat assistant. */
export type ToolSurface = 'mcp' | 'chat';

/**
 * How one tool call ended (JEF-365). A bounded set, so it can label a metric:
 *
 * - `ok`: the tool ran and returned a result.
 * - `domain_error`: a `DomainError` the caller can act on ("Application not found").
 * - `internal_error`: anything else thrown, which is a bug or an outage.
 * - `refused`: the token's scope does not allow the tool.
 * - `invalid_params`: the arguments, or the tool name itself, were unusable.
 */
export type ToolCallOutcome =
  'ok' | 'domain_error' | 'internal_error' | 'refused' | 'invalid_params';

/** What the observer is told about a call before it runs. No arguments, ever. */
export interface ToolCallMeta {
  surface: ToolSurface;
  /**
   * The tool name as requested. On MCP that is whatever the client sent, so
   * the observer checks it against the catalogue before it lands anywhere
   * with bounded cardinality: a span name, a metric label.
   */
  name: string;
  /** MCP only. Chat is session-authenticated and has no token. */
  tokenScope?: ApiTokenScope;
}

/**
 * Handed to the observed function so it can say how the call ended when
 * that is not simply "returned" or "threw". A call that reports nothing
 * and returns is `ok`, and one that throws is classified from the error.
 */
export interface ToolCallRecorder {
  /**
   * The call succeeded with this result. Only its serialised size is
   * recorded, never its content: results are the user's own records.
   */
  succeeded(result: unknown): void;
  /** A failure the surface caught and turned into a reply, so the observer never sees it thrown. */
  failed(error: unknown): void;
  invalidParams(): void;
  /**
   * The token's scope does not cover the tool. This is the MCP security
   * boundary, so it is also logged with the user and counted.
   */
  refused(userId: string): void;
}

/**
 * Records every MCP and chat tool call (JEF-365): which tool ran, whether
 * the caller could run it, and how it ended.
 *
 * A port so that `McpController` and `chatAssembly` can report a call without
 * importing OpenTelemetry, which neither layer may do. It wraps the dispatch
 * rather than a use case, so the tools that read a repository directly get a
 * span too.
 */
export interface IToolCallObserver {
  observe<T>(meta: ToolCallMeta, run: (call: ToolCallRecorder) => Promise<T>): Promise<T>;
}
