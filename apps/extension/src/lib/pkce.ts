export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** Bytes → base64url: unreserved characters only, no padding (RFC 7636 s4.1). */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * PKCE (RFC 7636) for the OAuth handoff code (JEF-383), mirroring
 * apps/mobile/src/auth/pkce.ts: the challenge rides the `/start` URL while the
 * verifier stays in this login's closure until `exchangeMobileOAuthCode`
 * presents it, so a captured redirect URL alone can't be redeemed.
 */
export async function createPkcePair(): Promise<PkcePair> {
  const verifier = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: toBase64Url(new Uint8Array(digest)) };
}
