import { beforeEach, describe, expect, it } from 'vitest';
import {
  coldStartSpanAttributes,
  resetColdStartForTesting,
  takeColdStart,
} from '#src/infrastructure/observability/coldStart.js';

const uptime = () => 4.2567;

describe('coldStart', () => {
  beforeEach(() => {
    resetColdStartForTesting();
  });

  describe('takeColdStart', () => {
    it('is true for the first call and false for every call after it', () => {
      expect(takeColdStart()).toBe(true);
      expect(takeColdStart()).toBe(false);
      expect(takeColdStart()).toBe(false);
    });
  });

  describe('coldStartSpanAttributes', () => {
    it('flags the first request with the process uptime in milliseconds', () => {
      expect(coldStartSpanAttributes({ url: '/graphql' }, uptime)).toEqual({
        'faas.coldstart': true,
        'app.process_uptime_ms': 4257,
      });
    });

    it('marks every later request as warm, without the uptime', () => {
      coldStartSpanAttributes({ url: '/graphql' }, uptime);

      expect(coldStartSpanAttributes({ url: '/graphql' }, uptime)).toEqual({
        'faas.coldstart': false,
      });
      expect(coldStartSpanAttributes({ url: '/mcp' }, uptime)).toEqual({
        'faas.coldstart': false,
      });
    });

    it('flags an /admin job like any other request', () => {
      expect(coldStartSpanAttributes({ url: '/admin/trash/purge' }, uptime)).toMatchObject({
        'faas.coldstart': true,
      });
    });

    it('leaves the startup probe unmarked and the flag for the first real request', () => {
      expect(coldStartSpanAttributes({ url: '/health' }, uptime)).toEqual({});
      expect(coldStartSpanAttributes({ url: '/health?probe=1' }, uptime)).toEqual({});

      expect(coldStartSpanAttributes({ url: '/graphql' }, uptime)).toMatchObject({
        'faas.coldstart': true,
      });
    });

    it('leaves later probes unmarked too', () => {
      coldStartSpanAttributes({ url: '/graphql' }, uptime);

      expect(coldStartSpanAttributes({ url: '/health' }, uptime)).toEqual({});
    });

    it('treats a request with no url as an ordinary request', () => {
      expect(coldStartSpanAttributes({}, uptime)).toMatchObject({ 'faas.coldstart': true });
    });
  });
});
