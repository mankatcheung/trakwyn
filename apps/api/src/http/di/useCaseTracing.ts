import type { NameAndRegistrationPair, Resolver } from 'awilix';

import { traceUseCase } from '#src/infrastructure/observability/tracedUseCase.js';

import type { Cradle } from './types.js';

/**
 * Use cases that are deliberately not traced (JEF-347).
 *
 * Whether a use case is traced is a composition decision, so it is made here
 * rather than inside the decorator or in the registration modules — the same
 * reasoning that keeps the MCP/chat tool split in `http/di` and leaves
 * `http/di/use-cases/*` as plain `asClass(...)` declarations.
 *
 * `AuthenticateRequestUseCase` runs on every authenticated request, so
 * tracing it would add a span to every trace in the system to report the same
 * few milliseconds of token verification. The cost is not the span's runtime,
 * it is that every trace grows a step nobody asks a question about.
 *
 * An entry here must name a real registration — `useCaseTracing.test.ts`
 * fails otherwise, so an exemption cannot outlive the use case it excused.
 */
export const UNTRACED_USE_CASES = new Set<string>(['authenticateRequestUseCase']);

/**
 * Wraps one registration so the instance it resolves comes back traced.
 *
 * Awilix reads `lifetime` from the resolver object and calls its `resolve()`,
 * so spreading the original and overriding only `resolve` leaves each
 * registration's `TRANSIENT` lifetime untouched.
 */
function traced<T>(name: string, resolver: Resolver<T>): Resolver<T> {
  return {
    ...resolver,
    resolve: (container) => {
      const instance = resolver.resolve(container);
      return instance && typeof instance === 'object'
        ? traceUseCase(instance as T & object, name)
        : instance;
    },
  };
}

/**
 * Applies tracing across every use-case registration at once.
 *
 * Done by mapping the whole map rather than per module, so a new domain
 * module under `http/di/use-cases/` is traced the moment it is spread into
 * `useCases` — there is nothing to remember, and so nothing to forget.
 */
export function applyUseCaseTracing<T extends NameAndRegistrationPair<Cradle>>(
  registrations: T,
): T {
  return Object.fromEntries(
    Object.entries(registrations).map(([name, resolver]) => [
      name,
      UNTRACED_USE_CASES.has(name) ? resolver : traced(name, resolver as Resolver<unknown>),
    ]),
  ) as T;
}
