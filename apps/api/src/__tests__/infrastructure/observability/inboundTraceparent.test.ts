import { describe, expect, it, afterEach } from 'vitest';
import { ENV } from '#src/infrastructure/config/constants.js';
import {
  INBOUND_TRACEPARENT_EVENT,
  inboundTraceparentFields,
  isInboundTraceparentLoggingEnabled,
  parseSampledFlag,
} from '#src/infrastructure/observability/inboundTraceparent.js';

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const SPAN_ID = '00f067aa0ba902b7';
const traceparent = (flags: string): string => `00-${TRACE_ID}-${SPAN_ID}-${flags}`;

describe('parseSampledFlag', () => {
  it('reads the sampled bit from a well-formed header', () => {
    expect(parseSampledFlag(traceparent('01'))).toBe(true);
    expect(parseSampledFlag(traceparent('00'))).toBe(false);
  });

  /**
   * `trace-flags` is a bit field, not an enum: bit 0 is sampled and the rest
   * are reserved, so `03` is sampled just as much as `01` is.
   */
  it('masks the sampled bit rather than comparing the whole flag byte', () => {
    expect(parseSampledFlag(traceparent('03'))).toBe(true);
    expect(parseSampledFlag(traceparent('02'))).toBe(false);
  });

  it('reports null for an absent header', () => {
    expect(parseSampledFlag(undefined)).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['not a traceparent at all', 'nonsense'],
    ['trace id too short', `00-${TRACE_ID.slice(1)}-${SPAN_ID}-01`],
    ['flags missing', `00-${TRACE_ID}-${SPAN_ID}`],
    ['flags not hex', traceparent('zz')],
    // The spec's hex is lowercase; anything else is not a header we parsed.
    ['uppercase hex', traceparent('01').toUpperCase()],
  ])('reports null for a malformed header (%s)', (_name, header) => {
    expect(parseSampledFlag(header)).toBeNull();
  });
});

describe('inboundTraceparentFields', () => {
  it('carries the raw header, the parsed flag and the event name', () => {
    expect(inboundTraceparentFields({ traceparent: traceparent('01') })).toEqual({
      event: INBOUND_TRACEPARENT_EVENT,
      traceparent: traceparent('01'),
      sampled: true,
      hasCloudTraceContext: false,
    });
  });

  it('reports x-cloud-trace-context separately, since Cloud Run injects both', () => {
    const fields = inboundTraceparentFields({
      'x-cloud-trace-context': `${TRACE_ID}/1234567890;o=1`,
    });

    expect(fields.hasCloudTraceContext).toBe(true);
    expect(fields.traceparent).toBeUndefined();
    expect(fields.sampled).toBeNull();
  });

  it('takes the first value when a header arrives repeated', () => {
    const fields = inboundTraceparentFields({
      traceparent: [traceparent('01'), traceparent('00')],
    });

    expect(fields.traceparent).toBe(traceparent('01'));
    expect(fields.sampled).toBe(true);
  });

  it('describes a request carrying no trace context at all', () => {
    expect(inboundTraceparentFields({})).toEqual({
      event: INBOUND_TRACEPARENT_EVENT,
      traceparent: undefined,
      sampled: null,
      hasCloudTraceContext: false,
    });
  });
});

describe('isInboundTraceparentLoggingEnabled', () => {
  afterEach(() => {
    delete process.env[ENV.LOG_INBOUND_TRACEPARENT];
  });

  it('is off unless explicitly turned on', () => {
    expect(isInboundTraceparentLoggingEnabled()).toBe(false);

    for (const value of ['', 'false', '1', 'yes', 'TRUE']) {
      process.env[ENV.LOG_INBOUND_TRACEPARENT] = value;
      expect(isInboundTraceparentLoggingEnabled()).toBe(false);
    }
  });

  it('is on for exactly "true"', () => {
    process.env[ENV.LOG_INBOUND_TRACEPARENT] = 'true';
    expect(isInboundTraceparentLoggingEnabled()).toBe(true);
  });
});
