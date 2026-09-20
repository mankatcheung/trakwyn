import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_SCRUB = resolve(import.meta.dirname, '../../../lib/analytics/scrub.ts');
const MOBILE_SCRUB = resolve(
  import.meta.dirname,
  '../../../../../mobile/src/lib/analytics/scrub.ts',
);

/**
 * `scrub.ts` exists twice — once per app — because there is no shared
 * runtime package between a Vite app and a React Native one, and the repo
 * already mirrors the few values both clients need rather than inventing a
 * package for them.
 *
 * Mirroring is only safe while the copies actually match. A deny-list that
 * gains `salaryExpectation` on web and not on mobile would be a silent hole
 * in exactly the protection this file provides, and nothing else would
 * notice. This test is what makes the duplication accountable.
 *
 * Only the leading doc comment is allowed to differ — each copy names its
 * own counterpart and its own SDK.
 */
function bodyOf(path: string): string {
  const source = readFileSync(path, 'utf8');
  const end = source.indexOf('*/');
  expect(end, `${path} should open with the shared doc comment`).toBeGreaterThan(0);
  return source.slice(end + 2).trim();
}

describe('scrub.ts parity between web and mobile', () => {
  it('keeps the two copies identical below their doc comments', () => {
    expect(bodyOf(MOBILE_SCRUB)).toBe(bodyOf(WEB_SCRUB));
  });

  it('has each copy point at the other, so the duplication is discoverable', () => {
    expect(readFileSync(WEB_SCRUB, 'utf8')).toContain('apps/mobile/src/lib/analytics/scrub.ts');
    expect(readFileSync(MOBILE_SCRUB, 'utf8')).toContain('apps/web/src/lib/analytics/scrub.ts');
  });
});
