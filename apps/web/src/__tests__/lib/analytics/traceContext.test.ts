import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getLastTraceId,
  isApiRequest,
  newTraceContext,
  rememberTraceId,
  resetTraceContext,
} from '#/lib/analytics/traceContext';

describe('newTraceContext', () => {
  it('produces a W3C traceparent the API can adopt without translation', () => {
    const { traceId, traceparent } = newTraceContext();

    // version-traceId-spanId-flags, 32 and 16 lowercase hex digits.
    expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(traceparent).toContain(traceId);
    expect(traceId).toHaveLength(32);
  });

  it('gives every request its own trace id', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newTraceContext().traceId));
    expect(ids.size).toBe(50);
  });

  it('never emits the all-zero trace id, which the W3C spec makes invalid', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(newTraceContext().traceId).not.toBe('0'.repeat(32));
    }
  });
});

describe('isApiRequest', () => {
  // The dev default is the relative proxy path; production is an absolute
  // URL on a sibling subdomain. Both shapes have to answer correctly.
  it('accepts the relative dev-proxy endpoint', () => {
    expect(isApiRequest('http://localhost:3000/graphql', '/graphql')).toBe(true);
  });

  it('accepts an absolute endpoint on the API origin', () => {
    expect(
      isApiRequest('https://api.trakwyn.com/chat/stream', 'https://api.trakwyn.com/graphql'),
    ).toBe(true);
  });

  it('refuses a third-party host — the blob upload is the live example', () => {
    expect(
      isApiRequest(
        'https://abc.public.blob.vercel-storage.com/x',
        'https://api.trakwyn.com/graphql',
      ),
    ).toBe(false);
  });

  it('refuses a look-alike host that merely starts with the API origin', () => {
    expect(
      isApiRequest('https://api.trakwyn.com.evil.test/graphql', 'https://api.trakwyn.com/graphql'),
    ).toBe(false);
  });

  it('refuses the web origin itself when the API lives on a different one', () => {
    expect(isApiRequest('https://www.trakwyn.com/x', 'https://api.trakwyn.com/graphql')).toBe(
      false,
    );
  });

  it('resolves a relative URL against the document, exactly as fetch would', () => {
    // Both sides relative is the dev configuration; they resolve to the same
    // origin and the header is sent.
    expect(isApiRequest('/chat/stream', '/graphql')).toBe(true);
  });

  it('refuses rather than guesses when a URL cannot be parsed at all', () => {
    expect(isApiRequest('http://', '/graphql')).toBe(false);
  });
});

describe('the remembered trace id', () => {
  beforeEach(() => resetTraceContext());
  afterEach(() => resetTraceContext());

  it('starts empty, so an exception before any request claims no trace', () => {
    expect(getLastTraceId()).toBeNull();
  });

  it('holds the most recent request, which is the one an error just followed', () => {
    rememberTraceId('a'.repeat(32));
    rememberTraceId('b'.repeat(32));
    expect(getLastTraceId()).toBe('b'.repeat(32));
  });
});
