import { describe, expect, it } from 'vitest';
import { STACK_FRAME_LIMIT, buildExceptionList, parseStack } from './exceptionList';

const CHROME_STACK = `TypeError: boom
    at save (chrome-extension://abcdef/chunks/popup-BxYz.js:12:34)
    at async handleSave (chrome-extension://abcdef/chunks/popup-BxYz.js:40:5)
    at chrome-extension://abcdef/background.js:7:1`;

const SAFARI_STACK = `save@safari-web-extension://0F2A6B1C/chunks/popup-BxYz.js:12:34
handleSave@safari-web-extension://0F2A6B1C/chunks/popup-BxYz.js:40:5
@safari-web-extension://0F2A6B1C/background.js:7:1`;

describe('parseStack', () => {
  it('parses a Chrome stack, outermost frame first', () => {
    const frames = parseStack(CHROME_STACK);

    expect(frames).toHaveLength(3);
    expect(frames.at(-1)).toEqual({
      platform: 'web:javascript',
      filename: 'chrome-extension://abcdef/chunks/popup-BxYz.js',
      function: 'save',
      lineno: 12,
      colno: 34,
      in_app: true,
    });
    expect(frames[0]).toMatchObject({
      filename: 'chrome-extension://abcdef/background.js',
      function: '?',
      lineno: 7,
    });
    expect(frames[1].function).toBe('handleSave');
  });

  it('parses a Safari stack the same way', () => {
    const frames = parseStack(SAFARI_STACK);

    expect(frames.map((parsed) => parsed.function)).toEqual(['?', 'handleSave', 'save']);
    expect(frames.at(-1)).toMatchObject({
      filename: 'safari-web-extension://0F2A6B1C/chunks/popup-BxYz.js',
      lineno: 12,
      colno: 34,
      in_app: true,
    });
  });

  it("marks frames outside the extension's own files as not in-app", () => {
    const [parsed] = parseStack('    at run (https://www.linkedin.com/static/app.js:1:2)');

    expect(parsed.in_app).toBe(false);
  });

  it('keeps only the innermost frames past the limit', () => {
    const lines = Array.from(
      { length: STACK_FRAME_LIMIT + 5 },
      (_, index) => `    at f${index} (chrome-extension://abcdef/a.js:${index + 1}:1)`,
    );

    const frames = parseStack(lines.join('\n'));

    expect(frames).toHaveLength(STACK_FRAME_LIMIT);
    expect(frames.at(-1)?.function).toBe('f0');
  });
});

describe('buildExceptionList', () => {
  it("carries the error's type, scrubbed message and frames", () => {
    const error = new TypeError('No account for ada@example.com');
    error.stack = CHROME_STACK;

    const [entry] = buildExceptionList(error, false);

    expect(entry.type).toBe('TypeError');
    expect(entry.value).toBe('No account for [redacted-email]');
    expect(entry.mechanism).toEqual({ type: 'generic', handled: false, synthetic: false });
    expect(entry.stacktrace?.frames).toHaveLength(3);
  });

  it('omits the stacktrace when there are no frames', () => {
    const error = new Error('boom');
    error.stack = undefined;

    expect(buildExceptionList(error, true)[0]).not.toHaveProperty('stacktrace');
  });

  it('reports a non-Error by type only', () => {
    expect(buildExceptionList({ secret: 'value' }, true)[0]).toMatchObject({
      type: 'object',
      value: 'A non-Error object was thrown',
    });
  });
});
