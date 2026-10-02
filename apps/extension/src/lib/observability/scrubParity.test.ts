import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REDACTED, scrubString, scrubValue } from './scrub';

const EXTENSION_SCRUB = resolve(import.meta.dirname, 'scrub.ts');
const WEB_SCRUB = resolve(import.meta.dirname, '../../../../web/src/lib/analytics/scrub.ts');

/**
 * `scrub.ts` is mirrored from the web app (JEF-387), as mobile's copy is and
 * for the same reason: there is no shared runtime package. Mirroring is only
 * safe while the copies match, so this holds the extension's copy to web's,
 * and web's scrubParity.test.ts holds mobile's. Only the leading doc comment
 * may differ.
 */
function bodyOf(path: string): string {
  const source = readFileSync(path, 'utf8');
  const end = source.indexOf('*/');
  expect(end, `${path} should open with a doc comment`).toBeGreaterThan(0);
  return source.slice(end + 2).trim();
}

describe('scrub.ts parity with the web app', () => {
  it('is identical to the web copy below the doc comment', () => {
    expect(bodyOf(EXTENSION_SCRUB)).toBe(bodyOf(WEB_SCRUB));
  });

  it('has each copy point at the other, so the duplication is discoverable', () => {
    expect(readFileSync(EXTENSION_SCRUB, 'utf8')).toContain('apps/web/src/lib/analytics/scrub.ts');
    expect(readFileSync(WEB_SCRUB, 'utf8')).toContain(
      'apps/extension/src/lib/observability/scrub.ts',
    );
  });
});

describe('what the Clipper must never report', () => {
  it('redacts session tokens wherever they appear', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2ln';

    expect(scrubString(`Authorization: Bearer ${jwt}`)).not.toContain(jwt);
    expect(scrubValue({ token: jwt, refreshToken: 'r', accessToken: jwt })).toEqual({
      token: REDACTED,
      refreshToken: REDACTED,
      accessToken: REDACTED,
    });
  });

  it('redacts the OAuth handoff code and PKCE verifier', () => {
    // The code arrives in a redirect URL's query string; both travel as
    // GraphQL variables.
    expect(scrubString('Bad redirect https://abc.chromiumapp.org/?code=handoff-123')).toBe(
      'Bad redirect https://abc.chromiumapp.org/?[redacted]',
    );
    expect(
      scrubValue({ variables: { code: 'handoff-123', codeVerifier: 'verifier-456' } }),
    ).toEqual({ variables: REDACTED });
  });

  it('redacts the email and a page URL down to its path', () => {
    expect(scrubString('No account for ada@example.com')).toBe('No account for [redacted-email]');
    expect(scrubString('https://www.linkedin.com/jobs/view/1/?trk=abc#top')).toBe(
      'https://www.linkedin.com/jobs/view/1/?[redacted]',
    );
  });

  it('redacts the job description', () => {
    expect(scrubValue({ description: 'We are hiring…', jobDescription: 'Same' })).toEqual({
      description: REDACTED,
      jobDescription: REDACTED,
    });
  });
});
