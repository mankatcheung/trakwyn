import { context, trace, SpanStatusCode, type Context, type Span } from '@opentelemetry/api';

import { AXIOM, TRACING } from '#src/infrastructure/config/constants.js';
import { DomainError } from '#src/use-cases/errors/DomainError.js';

/**
 * Wraps a use case's `execute()` in a span, so a trace names the application
 * step that ran rather than only the library calls it caused (JEF-347).
 *
 * Auto-instrumentation patches libraries, which is why a trace already
 * reaches from the HTTP span through the GraphQL resolver down to `pg` —
 * but use cases are plain classes nothing patches, so the steps in between
 * were invisible. For a resolver chaining several of them (login →
 * create session → new-device alert) that meant reading a stack trace to
 * learn which step failed, and no way at all to see which was slow.
 *
 * A decorator at the DI boundary, in the shape of `InstrumentedCache` and
 * `BlocklistingSessionRepository`: the behaviour is added where the object
 * is composed, not inside it. That is what keeps `use-cases/` free of any
 * import of this module — the dependency rule stays satisfied by
 * construction rather than by a test remembering to check.
 *
 * **No arguments are recorded on the span.** Use-case inputs carry
 * passwords, tokens, and chat message text, so the safe default is to
 * record the shape of the call (name, duration, outcome) and none of its
 * content.
 */
export function traceUseCase<T extends object>(instance: T, registrationName: string): T {
  // Awilix registers a few non-class values alongside the use cases, and a
  // use case is only interesting here through `execute`. Anything else is
  // handed back untouched rather than needlessly proxied.
  if (!hasExecute(instance)) return instance;

  const spanName = `${className(instance, registrationName)}.execute`;
  let tracedExecute: ((...args: unknown[]) => unknown) | undefined;

  return new Proxy(instance, {
    get(target, property, receiver) {
      if (property !== 'execute') return Reflect.get(target, property, receiver);
      // Cached so repeated reads of `.execute` yield the same function, and
      // so a use case resolved once but called many times wraps once.
      tracedExecute ??= makeTracedExecute(target, spanName);
      return tracedExecute;
    },
  });
}

function hasExecute(instance: object): instance is { execute: (...args: unknown[]) => unknown } {
  return typeof (instance as { execute?: unknown }).execute === 'function';
}

/**
 * The class name is what makes a span readable (`LoginUseCase.execute`), and
 * `tsc` emits unminified classes so it survives the build. The registration
 * name is a fallback for anything that arrives without one.
 */
function className(instance: object, registrationName: string): string {
  const name = instance.constructor?.name;
  if (name && name !== 'Object') return name;
  return registrationName.charAt(0).toUpperCase() + registrationName.slice(1);
}

function tracer() {
  return trace.getTracer(AXIOM.SERVICE_NAME);
}

/**
 * `execute` is called in three shapes across the codebase and each ends its
 * span at a different moment: a plain value returns immediately, a promise
 * ends when it settles, and an async generator — `StreamChatWithAssistantUseCase`
 * is the one — ends only when iteration finishes. Awaiting none of that
 * would close the chat's span at zero milliseconds and leave every `pg` span
 * its tool calls cause orphaned from it.
 */
function makeTracedExecute(target: { execute: (...args: unknown[]) => unknown }, spanName: string) {
  return function tracedExecute(...args: unknown[]): unknown {
    // Started against the context active at call time, so the span is a child
    // of whatever resolver or route is running — not of whoever happens to
    // pull the first value out of a generator later.
    const span = tracer().startSpan(spanName);
    const spanContext = trace.setSpan(context.active(), span);

    let result: unknown;
    try {
      result = context.with(spanContext, () => target.execute(...args));
    } catch (error) {
      // A synchronous throw, before anything was returned.
      failSpan(span, error);
      span.end();
      throw error;
    }

    if (isAsyncGenerator(result)) return traceAsyncGenerator(span, spanContext, result);

    if (isPromise(result)) {
      return result.then(
        (value) => {
          span.end();
          return value;
        },
        (error: unknown) => {
          failSpan(span, error);
          span.end();
          throw error;
        },
      );
    }

    span.end();
    return result;
  };
}

/**
 * Keeps the span open and active across the whole iteration, so work done
 * between yields — the chat loop's tool calls and their queries — nests
 * under it. `context.with` is re-entered per `next()` because the generator
 * body runs then, not when the generator object was created.
 */
async function* traceAsyncGenerator(
  span: Span,
  spanContext: Context,
  generator: AsyncGenerator<unknown>,
): AsyncGenerator<unknown> {
  try {
    let step = await context.with(spanContext, () => generator.next());
    while (!step.done) {
      yield step.value;
      step = await context.with(spanContext, () => generator.next());
    }
    return step.value;
  } catch (error) {
    failSpan(span, error);
    throw error;
  } finally {
    // A consumer that breaks out of its `for await` terminates this
    // generator here; the inner one has to be told too, or a use case
    // holding a resource open past its last yield never unwinds.
    await generator.return?.(undefined);
    span.end();
  }
}

/**
 * Records the failure without changing it: the original error is rethrown by
 * the caller, so `formatError`'s code-to-status mapping still applies and
 * what the client sees is unaffected.
 */
function failSpan(span: Span, error: unknown): void {
  if (error instanceof Error) span.recordException(error);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : String(error),
  });
  // A DomainError's code is the one field worth querying on — it separates
  // "this user asked for something that isn't there" from a server fault.
  if (error instanceof DomainError) span.setAttribute(TRACING.ERROR_CODE_ATTRIBUTE, error.code);
}

function isPromise(value: unknown): value is Promise<unknown> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === 'function';
}

function isAsyncGenerator(value: unknown): value is AsyncGenerator<unknown> {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as { [Symbol.asyncIterator]?: unknown; next?: unknown };
  return (
    typeof candidate[Symbol.asyncIterator] === 'function' && typeof candidate.next === 'function'
  );
}
