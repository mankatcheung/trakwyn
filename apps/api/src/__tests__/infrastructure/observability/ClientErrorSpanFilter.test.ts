import { SpanStatusCode } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';
import { describe, expect, it } from 'vitest';

import { GRAPHQL_VALIDATION_ERROR_CODE } from '#src/http/constants.js';
import { ClientErrorSpanFilter } from '#src/infrastructure/observability/ClientErrorSpanFilter.js';

function exceptionEvent(type: string) {
  return { name: 'exception', time: [0, 0], attributes: { 'exception.type': type } };
}

function spanWith(events: unknown[], code = SpanStatusCode.ERROR): ReadableSpan {
  return { events, status: { code, message: 'x' } } as unknown as ReadableSpan;
}

describe('ClientErrorSpanFilter', () => {
  const filter = new ClientErrorSpanFilter();

  it('drops the validation exception and the ERROR status it caused', () => {
    const span = spanWith([exceptionEvent(GRAPHQL_VALIDATION_ERROR_CODE)]);

    filter.onEnd(span);

    expect(span.events).toEqual([]);
    expect(span.status).toEqual({ code: SpanStatusCode.UNSET });
  });

  it('keeps other events when it removes the validation exception', () => {
    const other = { name: 'cache.miss', time: [0, 0], attributes: {} };
    const span = spanWith([other, exceptionEvent(GRAPHQL_VALIDATION_ERROR_CODE)]);

    filter.onEnd(span);

    expect(span.events).toEqual([other]);
  });

  it('leaves a real server exception and its status alone', () => {
    const event = exceptionEvent('TypeError');
    const span = spanWith([event]);

    filter.onEnd(span);

    expect(span.events).toEqual([event]);
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  });
});
