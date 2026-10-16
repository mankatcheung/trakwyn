import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IDocumentFileLinks } from '#src/use-cases/ports/IDocumentFileLinks.js';
import { DOCUMENT_FILE_LINK } from '#src/use-cases/constants.js';
import { DOCUMENT_FILE_ROUTE, ENV } from '#src/infrastructure/config/constants.js';

/** Keeps a signature made here from validating as any other HMAC under JWT_SECRET. */
const SIGNING_CONTEXT = 'document-file-link';

function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Signs and verifies the token in a document's file URL (JEF-51).
 *
 * The token is `<expiry>.<signature>`, an HMAC over the document id and the
 * expiry, so it opens that one document until it expires and nothing else.
 * Ownership is checked once, when the link is issued (a resolver only builds
 * one for a document the caller owns); the route then needs no session, which
 * is what lets `<iframe>`, `<img>` and a mobile `Linking.openURL` use it.
 * Stateless, reusing JWT_SECRET like `McpOAuthConsentService`.
 */
export class DocumentFileLinkService implements IDocumentFileLinks {
  private get secret(): string {
    return process.env[ENV.JWT_SECRET] ?? '';
  }

  /** `API_ORIGIN` when configured, else this server on its own port (local dev). */
  private get origin(): string {
    const configured = process.env[ENV.API_ORIGIN]?.trim();
    if (configured) return configured.replace(/\/+$/, '');
    return `http://localhost:${process.env[ENV.PORT] ?? 3001}`;
  }

  urlFor(documentId: string): string {
    const expiresAt = Math.floor(Date.now() / 1000) + DOCUMENT_FILE_LINK.TTL_S;
    const token = `${expiresAt}.${this.sign(documentId, expiresAt)}`;
    const path = DOCUMENT_FILE_ROUTE.PATH.replace(':id', encodeURIComponent(documentId));
    return `${this.origin}${path}?${DOCUMENT_FILE_ROUTE.TOKEN_PARAM}=${token}`;
  }

  verify(documentId: string, token: string): boolean {
    const [expiry, signature, ...rest] = token.split('.');
    if (!expiry || !signature || rest.length > 0 || !/^\d+$/.test(expiry)) return false;
    const expiresAt = Number(expiry);
    if (expiresAt < Math.floor(Date.now() / 1000)) return false;
    return equals(signature, this.sign(documentId, expiresAt));
  }

  private sign(documentId: string, expiresAt: number): string {
    return createHmac('sha256', this.secret)
      .update(`${SIGNING_CONTEXT}:${documentId}:${expiresAt}`)
      .digest('base64url');
  }
}
