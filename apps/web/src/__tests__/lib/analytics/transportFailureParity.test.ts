import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_COPY = resolve(import.meta.dirname, '../../../lib/analytics/transportFailure.ts');
const MOBILE_COPY = resolve(
  import.meta.dirname,
  '../../../../../mobile/src/lib/analytics/transportFailure.ts',
);

/**
 * Which failed GraphQL requests get reported is decided twice — once per
 * app, mirrored for the same reason as `scrub.ts` (see scrubParity.test.ts).
 * If the copies drift, an outage reads differently depending on which
 * client saw it, or one client starts reporting everyday 4xx noise; this
 * test keeps them identical below their doc comments (JEF-370).
 */
function bodyOf(path: string): string {
  const source = readFileSync(path, 'utf8');
  const end = source.indexOf('*/');
  expect(end, `${path} should open with a doc comment`).toBeGreaterThan(0);
  return source.slice(end + 2).trim();
}

describe('transportFailure.ts parity between web and mobile', () => {
  it('keeps the two copies identical below their doc comments', () => {
    expect(bodyOf(MOBILE_COPY)).toBe(bodyOf(WEB_COPY));
  });

  it('has each copy point at the other, so the duplication is discoverable', () => {
    expect(readFileSync(WEB_COPY, 'utf8')).toContain(
      'apps/mobile/src/lib/analytics/transportFailure.ts',
    );
    expect(readFileSync(MOBILE_COPY, 'utf8')).toContain(
      'apps/web/src/lib/analytics/transportFailure.ts',
    );
  });
});
