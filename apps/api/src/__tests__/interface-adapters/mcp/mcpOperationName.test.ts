import { describe, it, expect } from 'vitest';
import { mcpOperationName } from '#src/interface-adapters/mcp/mcpOperationName.js';
import { MCP_TOOLS } from '#src/interface-adapters/llm/toolCatalogue.js';

const rpc = (method: unknown, params?: unknown) => ({ jsonrpc: '2.0', id: 1, method, params });

describe('mcpOperationName (JEF-365)', () => {
  it('names a tool call after the tool', () => {
    expect(mcpOperationName(rpc('tools/call', { name: 'get_application' }))).toBe(
      'tools/call get_application',
    );
  });

  it('names every catalogue tool', () => {
    for (const tool of MCP_TOOLS) {
      expect(mcpOperationName(rpc('tools/call', { name: tool.name }))).toBe(
        `tools/call ${tool.name}`,
      );
    }
  });

  it('names the other methods it answers by method alone', () => {
    expect(mcpOperationName(rpc('tools/list'))).toBe('tools/list');
    expect(mcpOperationName(rpc('initialize'))).toBe('initialize');
  });

  it('never puts a client-chosen tool or method name into the span name', () => {
    expect(mcpOperationName(rpc('tools/call', { name: 'x'.repeat(500) }))).toBe(
      'tools/call unknown',
    );
    expect(mcpOperationName(rpc('tools/call', { name: 42 }))).toBe('tools/call unknown');
    expect(mcpOperationName(rpc('tools/call'))).toBe('tools/call unknown');
    expect(mcpOperationName(rpc('resources/list'))).toBe('unknown');
  });

  it('names nothing for a body that is not a JSON-RPC request', () => {
    expect(mcpOperationName(undefined)).toBeUndefined();
    expect(mcpOperationName('tools/call')).toBeUndefined();
    expect(mcpOperationName({ jsonrpc: '2.0' })).toBeUndefined();
  });
});
