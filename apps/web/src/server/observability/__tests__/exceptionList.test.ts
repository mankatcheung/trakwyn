import { describe, expect, it } from 'vitest';
import {
  buildExceptionList,
  parseStack,
  STACK_FRAME_LIMIT,
} from '#/server/observability/exceptionList';

const STACK = [
  'Error: boom',
  '    at loadJob (/var/task/apps/web/.output/server/chunks/job.mjs:10:5)',
  '    at async Object.handler (/var/task/node_modules/@tanstack/router-core/dist/index.js:42:7)',
  '    at /var/task/apps/web/.output/server/index.mjs:3:1',
  '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
  '    at Array.map (native)',
].join('\n');

describe('parseStack', () => {
  it('turns a V8 stack into frames, outermost first', () => {
    const frames = parseStack(STACK);

    expect(frames.map((frame) => frame.function)).toEqual([
      'Array.map',
      'process.processTicksAndRejections',
      '?',
      'Object.handler',
      'loadJob',
    ]);
    expect(frames.at(-1)).toEqual({
      platform: 'node:javascript',
      filename: '/var/task/apps/web/.output/server/chunks/job.mjs',
      function: 'loadJob',
      lineno: 10,
      colno: 5,
      in_app: true,
    });
  });

  it("marks only this app's own files as in-app", () => {
    const inApp = Object.fromEntries(parseStack(STACK).map((f) => [f.function, f.in_app]));

    expect(inApp).toEqual({
      loadJob: true,
      '?': true,
      'Object.handler': false,
      'process.processTicksAndRejections': false,
      'Array.map': false,
    });
  });

  it('strips a file:// prefix', () => {
    const [frame] = parseStack('    at run (file:///var/task/server.mjs:1:2)');
    expect(frame.filename).toBe('/var/task/server.mjs');
  });

  it('keeps the innermost frames when the stack is too deep', () => {
    const lines = Array.from(
      { length: STACK_FRAME_LIMIT + 10 },
      (_, i) => `    at fn${i} (/var/task/a.mjs:${i + 1}:1)`,
    );
    const frames = parseStack(lines.join('\n'));

    expect(frames).toHaveLength(STACK_FRAME_LIMIT);
    expect(frames.at(-1)?.function).toBe('fn0');
  });
});

describe('buildExceptionList', () => {
  it('reports an Error as one unhandled exception with its parsed stack', () => {
    const error = new Error('boom');
    error.stack = STACK;

    const [entry] = buildExceptionList(error, 'web.ssr.failed');

    expect(entry).toMatchObject({
      type: 'Error',
      value: 'boom',
      mechanism: { type: 'generic', handled: false, synthetic: false },
      stacktrace: { type: 'raw' },
    });
    expect(entry.stacktrace?.frames).toHaveLength(5);
  });

  it('keeps the subclass name as the type', () => {
    expect(buildExceptionList(new TypeError('bad'), 'web.ssr.failed')[0].type).toBe('TypeError');
  });

  it('redacts emails, tokens and query strings from the message and every frame', () => {
    const error = new Error(
      'failed for jane@example.com with eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig',
    );
    error.stack = `Error: ${error.message}\n    at fetchIt (/var/task/a.mjs:1:1)\n    at https://api.trakwyn.com/x?token=abc:2:3`;

    const serialized = JSON.stringify(buildExceptionList(error, 'web.ssr.failed'));

    expect(serialized).not.toContain('jane@example.com');
    expect(serialized).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(serialized).not.toContain('token=abc');
  });

  it('reports only the type of a non-Error throw, never its value', () => {
    const serialized = JSON.stringify(buildExceptionList('password=hunter2', 'web.ssr.failed'));

    expect(serialized).not.toContain('hunter2');
    expect(buildExceptionList('password=hunter2', 'web.ssr.failed')[0].type).toBe('string');
  });

  it('names the event when there is no error object at all', () => {
    expect(buildExceptionList(undefined, 'web.request.failed')).toEqual([
      expect.objectContaining({ type: 'web.request.failed', value: 'web.request.failed' }),
    ]);
  });

  it('omits the stacktrace when the error has no stack', () => {
    const error = new Error('boom');
    error.stack = undefined;
    expect(buildExceptionList(error, 'web.ssr.failed')[0]).not.toHaveProperty('stacktrace');
  });
});
