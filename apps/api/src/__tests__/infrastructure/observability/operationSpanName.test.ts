import { describe, it, expect, vi } from 'vitest';
import { ROOT_CONTEXT, type Span } from '@opentelemetry/api';
import { RPCType, setRPCMetadata } from '@opentelemetry/core';
import {
  applyOperationSpanName,
  recordOperationSpanName,
} from '#src/infrastructure/observability/operationSpanName.js';

function makeSpan() {
  return { setAttribute: vi.fn(), updateName: vi.fn() } as unknown as Span & {
    updateName: ReturnType<typeof vi.fn>;
  };
}

describe('operationSpanName', () => {
  it('renames an MCP server span after the operation once the response finishes (JEF-365)', () => {
    const span = makeSpan();
    const ctx = setRPCMetadata(ROOT_CONTEXT, { type: RPCType.HTTP, span, route: '/mcp' });

    expect(recordOperationSpanName('tools/call get_application', ctx)).toBe(span);
    expect(span.updateName).not.toHaveBeenCalled();

    applyOperationSpanName(span, { method: 'POST' });
    expect(span.updateName).toHaveBeenCalledWith('POST /mcp tools/call get_application');
  });

  it('does nothing outside an HTTP server request', () => {
    expect(recordOperationSpanName('tools/list', ROOT_CONTEXT)).toBeUndefined();
  });

  it('renames a span once, then forgets it', () => {
    const span = makeSpan();
    recordOperationSpanName(
      'tools/list',
      setRPCMetadata(ROOT_CONTEXT, { type: RPCType.HTTP, span, route: '/mcp' }),
    );

    applyOperationSpanName(span, { method: 'POST' });
    applyOperationSpanName(span, { method: 'POST' });

    expect(span.updateName).toHaveBeenCalledTimes(1);
  });
});
