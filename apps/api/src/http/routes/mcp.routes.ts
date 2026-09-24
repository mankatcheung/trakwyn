import type { IHttpRequest } from '#src/http/ports/IHttpRequest.js';
import type { IHttpResponse } from '#src/http/ports/IHttpResponse.js';
import type { RouteDefinition } from '#src/http/ports/RouteDefinition.js';
import type { Cradle } from '#src/http/container.js';
import { AUTH_HEADER } from '#src/infrastructure/config/constants.js';
import { ROUTES } from '#src/http/constants.js';
import { recordOperationSpanName } from '#src/infrastructure/observability/operationSpanName.js';
import { mcpOperationName } from '#src/interface-adapters/mcp/mcpOperationName.js';
import { protectedResourceMetadataUrl } from './mcpOAuth.routes.js';

/**
 * MCP transport. Authenticates the Bearer credential via
 * AuthenticateMcpRequestUseCase, then hands the JSON-RPC body to the
 * McpController (interface adapter) which owns all protocol logic.
 *
 * POST is the only method that carries messages: there is no server-initiated
 * SSE stream and no session handling, so this is a subset of MCP's Streamable
 * HTTP transport. GET and DELETE are still registered — see below — because
 * the difference between "not supported here" and "no such endpoint" is what
 * lets a client keep going instead of giving up on the server entirely.
 */
export function mcpRoutes(getCradle: () => Cradle): RouteDefinition[] {
  return [
    {
      method: 'POST',
      path: ROUTES.MCP,
      handler: async (req, res) => {
        // Names the trace `POST /mcp tools/call <tool>` rather than every one
        // being `POST /mcp` (JEF-365). Before auth, so a burst of 401s is
        // still tellable apart by what it was trying to call.
        const operation = mcpOperationName(req.body);
        if (operation) recordOperationSpanName(operation);

        const authHeader = req.headers.authorization;
        const rawToken =
          typeof authHeader === 'string' && authHeader.startsWith(AUTH_HEADER.BEARER_PREFIX)
            ? authHeader.slice(AUTH_HEADER.BEARER_PREFIX.length)
            : null;

        if (!rawToken) {
          res
            .status(401)
            .header(
              'WWW-Authenticate',
              `Bearer resource_metadata="${protectedResourceMetadataUrl(req)}"`,
            )
            .send({ error: 'Missing Authorization header' });
          return;
        }

        const { authenticateMcpRequestUseCase, mcpController } = getCradle();
        const authResult = await authenticateMcpRequestUseCase.execute(rawToken);
        if (!authResult) {
          res
            .status(401)
            .header(
              'WWW-Authenticate',
              `Bearer resource_metadata="${protectedResourceMetadataUrl(req)}"`,
            )
            .send({ error: 'Invalid or expired API token' });
          return;
        }

        const { status, body } = await mcpController.handle(
          req.body,
          authResult.sub,
          authResult.scope,
        );
        res.status(status ?? 200).send(body);
      },
    },
    // A client opens the server-to-client stream with GET, and terminates a
    // session with DELETE. Neither exists here, and the spec is specific about
    // how to say so: 405 with an Allow header, not 404. Fastify's default for
    // an unregistered method is 404, which reads as "this endpoint is not
    // here" — enough for a strict client to abandon the server before it ever
    // reaches the 401 that starts OAuth discovery.
    ...(['GET', 'DELETE'] as const).map((method) => ({
      method,
      path: ROUTES.MCP,
      handler: (_req: IHttpRequest, res: IHttpResponse) => {
        res
          .status(405)
          .header('Allow', 'POST')
          .send({ error: 'Only POST is supported on this endpoint' });
      },
    })),
  ];
}
