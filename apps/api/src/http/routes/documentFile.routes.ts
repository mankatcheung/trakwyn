import type { FastifyReply, FastifyRequest } from 'fastify';
import { DOCUMENT_FILE_ROUTE } from '#src/infrastructure/config/constants.js';
import { diScopeOf } from '#src/http/adapters/fastify/diScope.js';

interface DocumentFileRequest {
  Params: { id: string };
  Querystring: Record<string, unknown>;
}

/** RFC 5987 `attr-char`: `encodeURIComponent` leaves these four through, a header value cannot. */
function encodeFilename(name: string): string {
  return encodeURIComponent(name).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Serves a document's file (JEF-51), the only way to read one. The link in
 * `Document.url` carries a short-lived token bound to this document id
 * (`DocumentFileLinkService`), because the clients that open it cannot send
 * credentials: an `<iframe>`, an `<img>`, a mobile `Linking.openURL`.
 *
 * Everything the file's owner did not authorise looks the same, a 401: a
 * missing, malformed, expired or another document's token. A valid token for
 * a document that has since been deleted is a 404.
 *
 * Registered directly in `buildApp.ts` like the chat stream, since it needs
 * the per-request DI scope and streams a body. It returns the reply on every
 * path: an async Fastify handler that sends a stream and returns `undefined`
 * has its response ended before the stream is piped.
 */
export async function handleDocumentFile(
  request: FastifyRequest<DocumentFileRequest>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const { id } = request.params;
  const token = request.query[DOCUMENT_FILE_ROUTE.TOKEN_PARAM];
  const { documentFileLinks, documentRepository, storageProvider } = diScopeOf(request).cradle;

  if (typeof token !== 'string' || !documentFileLinks.verify(id, token)) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }

  const doc = await documentRepository.findById(id);
  const object = doc ? await storageProvider.getObject(doc.storageKey) : null;
  if (!doc || !object) {
    return reply.code(404).send({ error: 'Not found' });
  }

  reply
    // The stored type was checked against the upload allowlist; the bytes are
    // never sniffed into something else.
    .header('Content-Type', doc.mimeType)
    .header('Content-Disposition', `inline; filename*=UTF-8''${encodeFilename(doc.name)}`)
    .header('X-Content-Type-Options', 'nosniff')
    // The URL is a credential: keep it out of caches and out of Referer headers.
    .header('Cache-Control', 'private, no-store')
    .header('Referrer-Policy', 'no-referrer');
  if (object.size !== null) reply.header('Content-Length', object.size);
  return reply.send(object.stream);
}
