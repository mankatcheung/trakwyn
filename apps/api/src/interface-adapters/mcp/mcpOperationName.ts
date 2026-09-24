import { MCP_TOOLS } from '#src/interface-adapters/llm/toolCatalogue.js';
import { MCP_METHOD, MCP_UNKNOWN_OPERATION } from '#src/interface-adapters/mcp/constants.js';

const KNOWN_METHODS = new Set<string>(Object.values(MCP_METHOD));
const KNOWN_TOOLS = new Set<string>(MCP_TOOLS.map((tool) => tool.name));

/**
 * What an MCP request asked for, as the suffix of its trace's name:
 * `tools/call get_application`, `tools/list` (JEF-365). Without it every
 * trace is `POST /mcp`, as every GraphQL one was `POST /graphql` before
 * JEF-346.
 *
 * The body is whatever the client sent, and this ends up in a span name, so
 * only our own method and tool names pass through. Anything else is
 * `unknown`, and a body that is not a JSON-RPC request at all names nothing.
 */
export function mcpOperationName(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;

  const { method, params } = body as { method?: unknown; params?: unknown };
  if (typeof method !== 'string') return undefined;
  if (!KNOWN_METHODS.has(method)) return MCP_UNKNOWN_OPERATION;
  if (method !== MCP_METHOD.TOOLS_CALL) return method;

  const name = (params as { name?: unknown } | undefined)?.name;
  const tool = typeof name === 'string' && KNOWN_TOOLS.has(name) ? name : MCP_UNKNOWN_OPERATION;
  return `${method} ${tool}`;
}
