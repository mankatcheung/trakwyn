import { describe, expect, it } from 'vitest';
import { parseAxiomWebhook } from '#src/interface-adapters/alerts/axiomAlertWebhook.js';

const STACK = [
  'TypeError: Cannot read properties of undefined (reading id)',
  '    at GetApplicationUseCase.execute (/app/dist/use-cases/GetApplicationUseCase.js:42:17)',
  '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
].join('\n');

/** A use-case span as the match monitor sees it: exception flattened into dotted keys. */
const spanEvent = (stack = STACK) => ({
  _time: '2026-09-30T10:00:00Z',
  name: 'GetApplicationUseCase.execute',
  trace_id: 'trace-123',
  error: true,
  'resource.service.version': 'abc123',
  events: [
    {
      name: 'exception',
      attributes: {
        'exception.type': 'TypeError',
        'exception.message': 'Cannot read properties of undefined (reading id)',
        'exception.stacktrace': stack,
      },
    },
  ],
});

const payload = (overrides: Record<string, unknown> = {}) => ({
  action: 'Open',
  monitorId: 'mon1',
  title: 'Use case failed',
  description: 'A use case threw a non-DomainError.',
  timestamp: '2026-09-30T10:00:05Z',
  queryStartTime: '2026-09-30T09:59:00Z',
  queryEndTime: '2026-09-30T10:00:00Z',
  value: '0',
  matchedEvent: null,
  groupKeys: null,
  groupValues: null,
  ...overrides,
});

function parse(body: unknown) {
  const result = parseAxiomWebhook(body);
  if (!result.ok) throw new Error(`expected a valid payload: ${result.issues.join(', ')}`);
  return result.alert;
}

describe('parseAxiomWebhook', () => {
  it('rejects a body without a monitor id, naming the field', () => {
    const result = parseAxiomWebhook({ action: 'Open', title: 'x' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join()).toContain('monitorId');
  });

  it('maps Closed to a recovery', () => {
    expect(parse(payload({ action: 'Closed' })).state).toBe('closed');
    expect(parse(payload({ action: 'Open' })).state).toBe('open');
  });

  describe('a matched span with an exception', () => {
    const alert = parse(payload({ matchedEvent: spanEvent() }));

    it('titles the issue with the exception', () => {
      expect(alert.title).toBe(
        'Use case failed: TypeError — Cannot read properties of undefined (reading id)',
      );
    });

    it('carries the stack trace once and the whole event', () => {
      const error = alert.details.find((d) => d.label === 'Error');
      expect(error?.content).toBe(STACK);
      const event = alert.details.find((d) => d.label === 'Matched event');
      expect(JSON.parse(event!.content)).toEqual(spanEvent());
    });

    it('lists the release and trace id as facts', () => {
      expect(alert.facts).toContainEqual({ label: 'Release', value: 'abc123' });
      expect(alert.facts).toContainEqual({ label: 'Trace ID', value: 'trace-123' });
      expect(alert.facts.map((f) => f.label)).not.toContain('Value');
    });

    it('keeps its fingerprint when only line numbers move', () => {
      const moved = STACK.replace(':42:17', ':57:3');
      const again = parse(payload({ matchedEvent: spanEvent(moved) }));
      expect(again.fingerprint).toBe(alert.fingerprint);
      expect(alert.fingerprint).toMatch(/^axiom-mon1-[0-9a-f]{16}$/);
    });

    it('changes its fingerprint for a different throw site', () => {
      const other = STACK.replace('GetApplicationUseCase.execute', 'LoginUseCase.execute');
      expect(parse(payload({ matchedEvent: spanEvent(other) })).fingerprint).not.toBe(
        alert.fingerprint,
      );
    });
  });

  it('reads a pino error from a matched log line with nested attributes', () => {
    const alert = parse(
      payload({
        title: 'Scheduled job failed',
        matchedEvent: {
          attributes: {
            event: 'job.digest.failed',
            err: { type: 'Error', message: 'boom', stack: 'Error: boom\n    at run (x.js:1:1)' },
          },
        },
      }),
    );

    expect(alert.title).toBe('Scheduled job failed: Error — boom');
    expect(alert.details[0]?.content).toBe('Error: boom\n    at run (x.js:1:1)');
    expect(alert.facts).toContainEqual({ label: 'Log event', value: 'job.digest.failed' });
  });

  it('names the group of a grouped threshold alert and fingerprints per group', () => {
    const redis = parse(
      payload({
        title: 'Redis fail-open',
        value: '3',
        groupKeys: ['component'],
        groupValues: ['cache'],
      }),
    );
    const other = parse(
      payload({ title: 'Redis fail-open', groupKeys: ['component'], groupValues: ['rate_limit'] }),
    );

    expect(redis.title).toBe('Redis fail-open (component="cache")');
    expect(redis.facts).toContainEqual({ label: 'Value', value: '3' });
    expect(redis.details).toEqual([]);
    expect(redis.fingerprint).not.toBe(other.fingerprint);
  });

  it('gives an ungrouped threshold monitor one fingerprint', () => {
    const first = parse(payload({ title: 'Postgres pool errors above baseline', value: '25' }));
    const second = parse(payload({ title: 'Postgres pool errors above baseline', value: '40' }));

    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it('treats an empty matched event as none, so a threshold alert keeps its value', () => {
    const alert = parse(payload({ title: 'Postgres pool errors', value: '25', matchedEvent: {} }));

    expect(alert.facts).toContainEqual({ label: 'Value', value: '25' });
    expect(alert.details).toEqual([]);
  });
});
