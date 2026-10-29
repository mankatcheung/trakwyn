import { isDestructive, type ToolDefinition } from '#src/interface-adapters/llm/toolCatalogue.js';
import { MCP } from '#src/interface-adapters/mcp/constants.js';

/**
 * The behaviour hints a client reads to decide whether to ask the user
 * before calling a tool (MCP 2025-03-26 `ToolAnnotations`). They are hints,
 * not a boundary: scope enforcement in `tools/call` is what stops a write.
 */
export interface McpToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
}

/** One entry of a `tools/list` result. */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolDefinition['inputSchema'];
  annotations: McpToolAnnotations;
}

/**
 * Derived from the catalogue's tags rather than written per tool, so a new
 * tool cannot ship unannotated. An `update_*` tool sets the fields it is
 * given, so repeating the call changes nothing more; a `create_*` adds a row
 * each time, and `trash_application` finds nothing to trash the second time.
 */
function annotate(tool: ToolDefinition): McpToolAnnotations {
  return {
    readOnlyHint: tool.access === 'read',
    destructiveHint: isDestructive(tool),
    idempotentHint: tool.name.startsWith('update_'),
  };
}

/**
 * Adapts catalogue entries to MCP's wire shape: the internal `access` and
 * `destructive` tags become `annotations` and go no further.
 */
export function toMcpToolDefinitions(tools: readonly ToolDefinition[]): McpToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: annotate(tool),
  }));
}

/**
 * The version `initialize` answers with: the client's own when we support
 * it, otherwise our latest, which the client may accept or disconnect over
 * (MCP lifecycle, "Version Negotiation").
 */
export function negotiateProtocolVersion(requested: unknown): string {
  return typeof requested === 'string' &&
    (MCP.SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : MCP.PROTOCOL_VERSION;
}
