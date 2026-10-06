import { describe, expect, it } from 'vitest';
import config from '../../wxt.config';

/**
 * WXT fills the manifest's `version` from package.json when the config
 * doesn't set one. package.json is the version release-please bumps
 * (JEF-389), so a `version` here would be a second copy that goes stale.
 */
describe('wxt.config manifest', () => {
  it.each(['chrome', 'safari'])('sets no version of its own for %s', (browser) => {
    const manifest =
      typeof config.manifest === 'function'
        ? config.manifest({ browser } as never)
        : config.manifest;

    expect(manifest).toBeDefined();
    expect(manifest).not.toHaveProperty('version');
    expect(manifest).not.toHaveProperty('version_name');
  });
});
