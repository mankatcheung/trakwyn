import { DOCUMENT_FILE_ROUTE } from '#src/infrastructure/config/constants.js';

export const REDACTED = 'REDACTED';

const TOKEN_PARAM = new RegExp(`([?&]${DOCUMENT_FILE_ROUTE.TOKEN_PARAM}=)[^&#]*`, 'g');

/**
 * A request URL with a document file link's token blanked (JEF-51). The token
 * in `Document.url` is the credential for that file until it expires, so it
 * must not reach logs, where whoever can read them could replay it. Applied
 * to Fastify's `req` serializer; the OTel http instrumentation redacts the same
 * parameter from span attributes (`redactedQueryParams` in `tracing.ts`).
 */
export function redactDocumentToken(url: string): string {
  return url.replace(TOKEN_PARAM, `$1${REDACTED}`);
}
