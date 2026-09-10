import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { DomainError } from '#src/use-cases/errors/DomainError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { CHAT } from '#src/use-cases/constants.js';
import { AUTH_HEADER } from '#src/infrastructure/config/constants.js';
import { COOKIES } from '#src/http/constants.js';
import { diScopeOf } from '#src/http/adapters/fastify/diScope.js';
import { abortSignalFor } from '#src/http/adapters/fastify/buildGraphQLContext.js';

// Guards against writing to a connection the client already left — once
// `signal` (below) aborts mid-stream, the LLM call's own AbortError lands in
// the `catch` below and tries to write an `error` frame to a socket that's
// already gone. Same for the `finally`'s `.end()`. Without this, that write
// throws (or emits an unhandled 'error' on `reply.raw`, which has no
// listener), turning a client's ordinary disconnect into a server crash.
function writeSSE(reply: FastifyReply, event: string, data: unknown): void {
  if (reply.raw.writableEnded) return;
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function errorPayload(err: unknown): { code: string; message: string } {
  if (err instanceof DomainError) return { code: err.code, message: err.message };
  return { code: ERROR_CODES.INTERNAL_ERROR, message: 'Something went wrong' };
}

/**
 * The request body, checked before the response is hijacked so a bad
 * request gets an ordinary 400 rather than an SSE `error` frame. The
 * length cap mirrors the use case's own check (`CHAT.MAX_MESSAGE_CHARS`);
 * refusing here as well keeps a 1 MB body from being parsed into a string
 * and handed further in.
 */
const bodySchema = z.object({
  conversationId: z.string().min(1),
  message: z.string().min(1).max(CHAT.MAX_MESSAGE_CHARS),
});

/**
 * Same cookie-based JWT auth as `buildGraphQLContext.ts` (cookie, falling
 * back to a Bearer header for non-cookie clients) — duplicated rather than
 * shared, since that function builds a full `GraphQLContext` this route has
 * no use for and no Mercurius context to plug into.
 */
async function authenticate(request: FastifyRequest): Promise<{ sub: string } | null> {
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

/**
 * Streams the assistant's chat reply (JEF-239) — see `ROUTES.CHAT_STREAM`'s
 * doc comment for why this bypasses the `RouteDefinition`/`IHttpResponse`
 * abstraction and writes directly to the raw Fastify response. Registered
 * directly in `buildApp.ts`, not through `registerRoutes`, for the same
 * reason MCP is: it needs the per-request DI scope, which only exists once
 * Fastify has actually routed the request.
 */
export async function handleChatStream(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = await authenticate(request);
  if (!user) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }

  const parsed = bodySchema.safeParse(request.body);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((issue) => issue.code === 'too_big');
    reply.code(400).send({
      error: tooLong
        ? `message must be at most ${CHAT.MAX_MESSAGE_CHARS} characters`
        : 'conversationId and message are required',
    });
    return;
  }
  const { conversationId, message } = parsed.data;

  // Fastify's normal response lifecycle (serialization, onSend hooks) has no
  // notion of a response written incrementally over time — hijack() opts
  // this response out of it so writing directly to reply.raw and manually
  // calling .end() is safe.
  reply.hijack();
  // Headers accumulated by onRequest hooks — above all @fastify/cors's
  // Access-Control-Allow-Origin/-Credentials — live in Fastify's own reply
  // store and are normally flushed by the send lifecycle hijack() just opted
  // out of. Copying them onto the raw response is what keeps this readable
  // cross-origin: without them the browser passes the preflight (which
  // @fastify/cors answers itself, never reaching this handler) and then
  // blocks the response body, so `fetch` rejects and the stream never
  // starts. Same-origin callers — CI's e2e run through Vite's dev proxy —
  // never notice, which is how this shipped broken twice.
  for (const [key, value] of Object.entries(reply.getHeaders())) {
    if (value !== undefined) reply.raw.setHeader(key, value);
  }
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    // Disables response buffering on nginx-fronted deployments — without it
    // a reverse proxy can hold the whole stream until it closes, defeating
    // the point of streaming.
    'X-Accel-Buffering': 'no',
  });

  const { streamChatWithAssistantUseCase } = diScopeOf(request).cradle;
  // Same mechanism as `buildGraphQLContext.ts`'s `abortSignal` (JEF-240) —
  // fires only if the connection closes before this response finished, so a
  // client disconnect (navigation, tab close, the chat UI's cancel button)
  // aborts the in-flight LLM fetch instead of letting it run to completion
  // (and being billed for) with nobody left to read the result.
  const signal = abortSignalFor(reply);

  try {
    for await (const event of streamChatWithAssistantUseCase.execute({
      userId: user.sub,
      conversationId,
      message,
      signal,
    })) {
      if (event.type === 'delta') writeSSE(reply, 'delta', { text: event.text });
      else if (event.type === 'fallback')
        writeSSE(reply, 'fallback', { from: event.from, to: event.to });
      else writeSSE(reply, 'done', {});
    }
  } catch (err) {
    writeSSE(reply, 'error', errorPayload(err));
  } finally {
    if (!reply.raw.writableEnded) reply.raw.end();
  }
}
