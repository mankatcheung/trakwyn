import { createContainer, type AwilixContainer } from 'awilix';

import { infrastructure } from './infrastructure.js';
import { repositories } from './repositories.js';
import { rateLimiters } from './rate-limiters.js';
import { mappers } from './mappers.js';
import { resolvers } from './resolvers.js';
import { useCases } from './use-cases/index.js';
import { applyUseCaseTracing } from './useCaseTracing.js';
import { isObservabilityEnabled } from '#src/infrastructure/observability/tracing.js';

import type { Cradle } from './types.js';

export function buildContainer(): AwilixContainer<Cradle> {
  const container = createContainer<Cradle>();
  container.register({
    ...infrastructure,
    ...repositories,
    ...rateLimiters,
    ...mappers,
    ...resolvers,
    // Tracing is applied in this one place, so a new domain module cannot opt
    // out by forgetting anything (JEF-347). Gated on `isObservabilityEnabled`
    // (JEF-345) so dev and test resolve the plain instances: the tracer would
    // be a no-op there anyway, and this keeps the proxy out of the hot path.
    ...(isObservabilityEnabled ? applyUseCaseTracing(useCases) : useCases),
  });
  return container;
}
