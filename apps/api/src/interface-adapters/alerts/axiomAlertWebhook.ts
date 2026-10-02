import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { AlertNotification } from '#src/use-cases/alerts/alertNotification.js';

/**
 * The body `infra/axiom`'s custom-webhook notifier sends (JEF-382). Its Go
 * template only JSON-escapes the three fields it has helpers for
 * (`MatchedEvent`, `GroupKeys`, `GroupValues`); everything else is quoted as
 * a string, which is why `value` and the times are strings here.
 */
const axiomWebhookSchema = z.object({
  action: z.string(),
  monitorId: z.string().min(1),
  title: z.string(),
  description: z.string().default(''),
  timestamp: z.string().default(''),
  queryStartTime: z.string().default(''),
  queryEndTime: z.string().default(''),
  value: z.string().default(''),
  matchedEvent: z.record(z.unknown()).nullish(),
  groupKeys: z.array(z.string()).nullish(),
  groupValues: z.array(z.unknown()).nullish(),
});

export type AxiomWebhookPayload = z.infer<typeof axiomWebhookSchema>;

export type ParsedAxiomWebhook =
  { ok: true; alert: AlertNotification } | { ok: false; issues: string[] };

/**
 * Where a matched event keeps its error, as path suffixes. Axiom flattens
 * some OTel attributes into dotted keys (`attributes.exception.type`) and
 * nests others (`events[0].attributes`), so a suffix is matched against the
 * key path either way. Spans come first (`traceUseCase` records the
 * exception); then log lines, whose pino `err` arrives as log attributes.
 */
const ERROR_PATHS = {
  type: [
    ['exception', 'type'],
    ['err', 'type'],
    ['err', 'name'],
    ['error', 'type'],
  ],
  message: [
    ['exception', 'message'],
    ['err', 'message'],
    ['status', 'message'],
  ],
  stack: [
    ['exception', 'stacktrace'],
    ['err', 'stack'],
  ],
} as const;

const FACT_PATHS: ReadonlyArray<{ label: string; path: readonly string[] }> = [
  { label: 'Release', path: ['service', 'version'] },
  { label: 'Log event', path: ['attributes', 'event'] },
  { label: 'Error code', path: ['app', 'error', 'code'] },
  { label: 'Trace ID', path: ['trace_id'] },
];

/** Hash length of the fingerprint's variable part: 64 bits, far past collision range for one project's alerts. */
const FINGERPRINT_HASH_CHARS = 16;

type Path = readonly string[];

/**
 * Depth-first over objects and arrays, yielding every string leaf with its
 * key path. Dotted keys are split, so `{"exception.type": x}` and
 * `{exception: {type: x}}` yield the same path.
 */
function* stringLeaves(value: unknown, path: string[] = []): Generator<[Path, string]> {
  if (typeof value === 'string') {
    yield [path, value];
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) yield* stringLeaves(item, path);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      yield* stringLeaves(child, [...path, ...key.split('.')]);
    }
  }
}

function endsWith(path: Path, suffix: Path): boolean {
  if (suffix.length > path.length) return false;
  return suffix.every((segment, i) => path[path.length - suffix.length + i] === segment);
}

function find(event: Record<string, unknown>, suffixes: readonly Path[]): string | undefined {
  for (const suffix of suffixes) {
    for (const [path, leaf] of stringLeaves(event)) {
      if (leaf && endsWith(path, suffix)) return leaf;
    }
  }
  return undefined;
}

/**
 * The first stack frame with its line and column dropped: the same bug keeps
 * the same fingerprint across deploys that only shift line numbers.
 */
function topFrame(stack: string | undefined): string {
  const frame = stack?.split('\n').find((line) => line.trim().startsWith('at '));
  return frame?.trim().replace(/:\d+:\d+\)?$/, '') ?? '';
}

function fingerprint(monitorId: string, parts: string[]): string {
  const hash = createHash('sha256').update(parts.join('\u0000')).digest('hex');
  return `axiom-${monitorId}-${hash.slice(0, FINGERPRINT_HASH_CHARS)}`;
}

interface ExtractedError {
  type?: string;
  message?: string;
  stack?: string;
}

function extractError(event: Record<string, unknown> | null | undefined): ExtractedError | null {
  if (!event) return null;
  const error = {
    type: find(event, ERROR_PATHS.type),
    message: find(event, ERROR_PATHS.message),
    stack: find(event, ERROR_PATHS.stack),
  };
  return error.type || error.message || error.stack ? error : null;
}

function groupFact(payload: AxiomWebhookPayload): string | null {
  const keys = payload.groupKeys ?? [];
  const values = payload.groupValues ?? [];
  if (keys.length === 0) return null;
  return keys.map((key, i) => `${key}=${JSON.stringify(values[i] ?? null)}`).join(', ');
}

function errorText({ type, message, stack }: ExtractedError): string {
  const head = [type, message].filter(Boolean).join(': ');
  // A V8 stack starts with the same `Type: message` line; don't print it twice.
  if (stack && head && stack.startsWith(head)) return stack;
  return [head, stack].filter(Boolean).join('\n');
}

export function toAlertNotification(payload: AxiomWebhookPayload): AlertNotification {
  // A threshold alert has no matched event; `jsonObject` may render that as
  // `{}` rather than `null`, and an empty object is no event either.
  const matched = payload.matchedEvent;
  const event = matched && Object.keys(matched).length > 0 ? matched : null;
  const error = extractError(event);
  const group = groupFact(payload);

  const facts = [
    { label: 'Monitor', value: `${payload.title} (${payload.monitorId})` },
    { label: 'Fired at', value: payload.timestamp },
    ...(payload.queryStartTime || payload.queryEndTime
      ? [{ label: 'Window', value: `${payload.queryStartTime} → ${payload.queryEndTime}` }]
      : []),
    // A match monitor has no value to speak of; Axiom sends 0.
    ...(event ? [] : [{ label: 'Value', value: payload.value }]),
    ...(group ? [{ label: 'Group', value: group }] : []),
    ...(event
      ? FACT_PATHS.flatMap(({ label, path }) => {
          const value = find(event, [path]);
          return value ? [{ label, value }] : [];
        })
      : []),
  ].filter(({ value }) => value !== '');

  const details = [
    ...(error ? [{ label: 'Error', language: 'text', content: errorText(error) }] : []),
    ...(event
      ? [{ label: 'Matched event', language: 'json', content: JSON.stringify(event, null, 2) }]
      : []),
  ];

  const title = error?.type
    ? `${payload.title}: ${error.type}${error.message ? ` — ${error.message}` : ''}`
    : group
      ? `${payload.title} (${group})`
      : payload.title;

  // What makes two alerts "the same problem": for an error, its type and
  // where it was thrown; for a grouped threshold, the group; otherwise the
  // monitor alone, so a monitor that stays unhealthy keeps one issue.
  const identity = error
    ? [error.type ?? '', topFrame(error.stack) || (error.message ?? '')]
    : [group ?? '', (event && find(event, [['attributes', 'event']])) ?? ''];

  return {
    source: 'Axiom',
    title,
    summary: payload.description,
    state: payload.action.toLowerCase() === 'closed' ? 'closed' : 'open',
    fingerprint: fingerprint(payload.monitorId, identity),
    facts,
    details,
    links: [],
  };
}

export function parseAxiomWebhook(body: unknown): ParsedAxiomWebhook {
  const result = axiomWebhookSchema.safeParse(body);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }
  return { ok: true, alert: toAlertNotification(result.data) };
}
