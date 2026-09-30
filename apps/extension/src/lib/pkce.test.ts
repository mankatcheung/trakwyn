import { describe, it, expect } from 'vitest';
import { createPkcePair } from './pkce';

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** S256 computed independently of the code under test. */
async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(Array.from(new Uint8Array(digest), (b) => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('createPkcePair', () => {
  it('makes a 43-character base64url verifier (32 random bytes, RFC 7636)', async () => {
    const { verifier } = await createPkcePair();

    expect(verifier).toMatch(BASE64URL);
    expect(verifier).toHaveLength(43);
  });

  it('makes the challenge the S256 hash of the verifier', async () => {
    const { verifier, challenge } = await createPkcePair();

    expect(challenge).toBe(await s256(verifier));
  });

  it('makes a fresh verifier every time', async () => {
    const [a, b] = await Promise.all([createPkcePair(), createPkcePair()]);

    expect(a.verifier).not.toBe(b.verifier);
  });
});
