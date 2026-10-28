import type { FastifyRequest } from 'fastify';
import { AUTH_HEADER } from '#src/infrastructure/config/constants.js';
import { COOKIES } from '#src/http/constants.js';
import { diScopeOf } from '#src/http/adapters/fastify/diScope.js';

/**
 * Same cookie-based JWT auth as `buildGraphQLContext.ts` (cookie, falling
 * back to a Bearer header for non-cookie clients) — kept apart from it, since
 * that function builds a full `GraphQLContext` the routes registered directly
 * on Fastify (`/chat/stream`, `/profile/cv-import`) have no use for and no
 * Mercurius context to plug into.
 */
export async function authenticateRoute(request: FastifyRequest): Promise<{ sub: string } | null> {
  const cookieToken = request.cookies[COOKIES.ACCESS_TOKEN];
  const authHeader = request.headers.authorization;
  const bearerToken =
    typeof authHeader === 'string' && authHeader.startsWith(AUTH_HEADER.BEARER_PREFIX)
      ? authHeader.slice(AUTH_HEADER.BEARER_PREFIX.length)
      : null;
  const rawToken = cookieToken ?? bearerToken;
  if (!rawToken) return null;

  const { authenticateRequestUseCase } = diScopeOf(request).cradle;
  return authenticateRequestUseCase.execute(rawToken);
}
