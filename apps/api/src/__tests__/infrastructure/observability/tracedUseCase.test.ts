import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import { traceUseCase } from '#src/infrastructure/observability/tracedUseCase.js';
import { NotFoundError } from '#src/use-cases/errors/DomainError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { TRACING } from '#src/infrastructure/config/constants.js';

/**
 * Asserts against spans a real SDK produced rather than a mocked tracer: the
 * point of the decorator is the shape of the trace it emits — names, nesting,
 * status — and a fake tracer would let all three drift.
 */
const exporter = new InMemorySpanExporter();
const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });
// `NodeSDK` installs this in production; the decorator's nesting depends on
// it, so the test has to stand it up rather than assume it.
const contextManager = new AsyncLocalStorageContextManager();

beforeAll(() => {
  trace.setGlobalTracerProvider(provider);
  context.setGlobalContextManager(contextManager.enable());
});

afterEach(() => {
  exporter.reset();
});

afterAll(async () => {
  await provider.shutdown();
  contextManager.disable();
  context.disable();
  trace.disable();
});

const finishedSpanNames = () => exporter.getFinishedSpans().map((span) => span.name);
const spanNamed = (name: string) => exporter.getFinishedSpans().find((span) => span.name === name)!;

class LoginUseCase {
  async execute(email: string): Promise<string> {
    return `token:${email}`;
  }
}

class FailingUseCase {
  async execute(): Promise<never> {
    throw new NotFoundError('Application');
  }
}

describe('traceUseCase', () => {
  it('records a span named after the class, once per call', async () => {
    const useCase = traceUseCase(new LoginUseCase(), 'loginUseCase');

    await useCase.execute('a@example.com');
    await useCase.execute('b@example.com');

    expect(finishedSpanNames()).toEqual(['LoginUseCase.execute', 'LoginUseCase.execute']);
  });

  it('passes the return value through untouched', async () => {
    const useCase = traceUseCase(new LoginUseCase(), 'loginUseCase');

    await expect(useCase.execute('a@example.com')).resolves.toBe('token:a@example.com');
  });

  it('ends a successful span without an error status', async () => {
    const useCase = traceUseCase(new LoginUseCase(), 'loginUseCase');

    await useCase.execute('a@example.com');

    const span = spanNamed('LoginUseCase.execute');
    expect(span.status.code).not.toBe(SpanStatusCode.ERROR);
    expect(span.events).toHaveLength(0);
  });

  it('records the exception, the ERROR status and the DomainError code on a throw', async () => {
    const useCase = traceUseCase(new FailingUseCase(), 'failingUseCase');

    await expect(useCase.execute()).rejects.toThrow('Application not found');

    const span = spanNamed('FailingUseCase.execute');
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.attributes[TRACING.ERROR_CODE_ATTRIBUTE]).toBe(ERROR_CODES.NOT_FOUND);
    expect(span.events.map((event) => event.name)).toContain('exception');
  });

  it('rethrows the original error instance, so formatError still maps it', async () => {
    const useCase = traceUseCase(new FailingUseCase(), 'failingUseCase');

    const error = await useCase.execute().catch((err: unknown) => err);

    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as NotFoundError).code).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('marks a non-DomainError failure ERROR without an error code attribute', async () => {
    class BrokenUseCase {
      async execute(): Promise<never> {
        throw new Error('connection reset');
      }
    }
    const useCase = traceUseCase(new BrokenUseCase(), 'brokenUseCase');

    await expect(useCase.execute()).rejects.toThrow('connection reset');

    const span = spanNamed('BrokenUseCase.execute');
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.attributes[TRACING.ERROR_CODE_ATTRIBUTE]).toBeUndefined();
  });

  it('ends the span when execute throws synchronously', () => {
    class SyncThrowUseCase {
      execute(): never {
        throw new Error('bad arguments');
      }
    }
    const useCase = traceUseCase(new SyncThrowUseCase(), 'syncThrowUseCase');

    expect(() => useCase.execute()).toThrow('bad arguments');
    expect(spanNamed('SyncThrowUseCase.execute').status.code).toBe(SpanStatusCode.ERROR);
  });

  it('nests a use case called by another under its caller', async () => {
    const inner = traceUseCase(new LoginUseCase(), 'loginUseCase');
    class OuterUseCase {
      async execute(): Promise<string> {
        return inner.execute('a@example.com');
      }
    }
    const outer = traceUseCase(new OuterUseCase(), 'outerUseCase');

    await outer.execute();

    const outerSpan = spanNamed('OuterUseCase.execute');
    const innerSpan = spanNamed('LoginUseCase.execute');
    expect(innerSpan.parentSpanContext?.spanId).toBe(outerSpan.spanContext().spanId);
    expect(innerSpan.spanContext().traceId).toBe(outerSpan.spanContext().traceId);
  });

  it('leaves an object without an execute method untouched', () => {
    const plain = { hello: () => 'world' };

    expect(traceUseCase(plain, 'notAUseCase')).toBe(plain);
  });

  it('falls back to the registration name when the class is anonymous', async () => {
    const anonymous = { execute: async () => 'ok' };

    await traceUseCase(anonymous, 'someUseCase').execute();

    expect(finishedSpanNames()).toEqual(['SomeUseCase.execute']);
  });

  describe('async generators', () => {
    class StreamingUseCase {
      async *execute(): AsyncGenerator<string> {
        yield 'a';
        yield 'b';
      }
    }

    it('yields every value through', async () => {
      const useCase = traceUseCase(new StreamingUseCase(), 'streamingUseCase');

      const seen: string[] = [];
      for await (const value of useCase.execute()) seen.push(value);

      expect(seen).toEqual(['a', 'b']);
    });

    it('keeps the span open until iteration finishes, and nests work done between yields', async () => {
      class NestedStreamUseCase {
        async *execute(): AsyncGenerator<string> {
          trace.getTracer('test').startSpan('tool.call').end();
          yield 'a';
        }
      }
      const useCase = traceUseCase(new NestedStreamUseCase(), 'nestedStreamUseCase');

      const iterator = useCase.execute();
      await iterator.next();
      // Still mid-iteration: the use case's own span must not have ended yet.
      expect(finishedSpanNames()).toEqual(['tool.call']);

      while (!(await iterator.next()).done) {
        // drain
      }

      expect(finishedSpanNames()).toContain('NestedStreamUseCase.execute');
      const toolSpan = spanNamed('tool.call');
      const useCaseSpan = spanNamed('NestedStreamUseCase.execute');
      expect(toolSpan.parentSpanContext?.spanId).toBe(useCaseSpan.spanContext().spanId);
    });

    it('ends the span when the consumer breaks out early', async () => {
      const useCase = traceUseCase(new StreamingUseCase(), 'streamingUseCase');

      // What `break` inside a `for await` does: take one value, then tell the
      // generator to stop.
      const iterator = useCase.execute();
      await iterator.next();
      await iterator.return(undefined);

      expect(finishedSpanNames()).toEqual(['StreamingUseCase.execute']);
    });

    it('records a failure thrown mid-stream and rethrows it', async () => {
      class FailingStreamUseCase {
        async *execute(): AsyncGenerator<string> {
          yield 'a';
          throw new NotFoundError('Conversation');
        }
      }
      const useCase = traceUseCase(new FailingStreamUseCase(), 'failingStreamUseCase');

      await expect(
        (async () => {
          const iterator = useCase.execute();
          while (!(await iterator.next()).done) {
            // drain until it throws
          }
        })(),
      ).rejects.toThrow('Conversation not found');

      const span = spanNamed('FailingStreamUseCase.execute');
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.attributes[TRACING.ERROR_CODE_ATTRIBUTE]).toBe(ERROR_CODES.NOT_FOUND);
    });
  });

  it('starts the span under the context active when execute was called', async () => {
    const useCase = traceUseCase(new LoginUseCase(), 'loginUseCase');
    const tracer = trace.getTracer('test');
    const parent = tracer.startSpan('resolver');

    await context.with(trace.setSpan(context.active(), parent), () =>
      useCase.execute('a@example.com'),
    );
    parent.end();

    expect(spanNamed('LoginUseCase.execute').parentSpanContext?.spanId).toBe(
      parent.spanContext().spanId,
    );
  });
});
