/**
 * The short-lived links that let a client open a document's file (JEF-51).
 * A client cannot always send credentials with the request (an `<iframe>`,
 * `Linking.openURL`), so the link carries its own, bound to one document.
 */
export interface IDocumentFileLinks {
  /** A link to the file, valid for `DOCUMENT_FILE_LINK.TTL_S`. */
  urlFor(documentId: string): string;
  /** True only for an unexpired token this server issued for exactly this document. */
  verify(documentId: string, token: string): boolean;
}
