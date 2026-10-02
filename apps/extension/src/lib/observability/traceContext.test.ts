import { beforeEach, describe, expect, it } from 'vitest';
import {
  getLastTraceId,
  newTraceContext,
  rememberTraceId,
  resetTraceContext,
} from './traceContext';

beforeEach(() => {
  resetTraceContext();
});

describe('newTraceContext', () => {
  it('builds a sampled W3C traceparent around its trace id', () => {
    const { traceId, traceparent } = newTraceContext();

    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(traceparent).toMatch(new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`));
  });

  it('mints a new trace per call', () => {
    expect(newTraceContext().traceId).not.toBe(newTraceContext().traceId);
  });
});

describe('the last trace id', () => {
  it('is null until a request is made, then the most recent one', () => {
    expect(getLastTraceId()).toBeNull();

    rememberTraceId('a'.repeat(32));
    rememberTraceId('b'.repeat(32));

    expect(getLastTraceId()).toBe('b'.repeat(32));
  });
});
