import { describe, expect, it } from 'vitest';
import { API_URLS } from './apiUrls';
import { buildManifest } from './manifest';

const DEV_HOST_PERMISSION = `${new URL(API_URLS.DEVELOPMENT).origin}/*`;

describe('buildManifest host permissions', () => {
  it('lets a dev build reach the local API', () => {
    const manifest = buildManifest({ browser: 'chrome', command: 'serve' });

    expect(manifest.host_permissions).toEqual([DEV_HOST_PERMISSION]);
  });

  it.each(['chrome', 'safari'])('asks a %s production build for no host permission', (browser) => {
    const manifest = buildManifest({ browser, command: 'build' });

    // The API answers extension origins through CORS, and the content script's
    // own `matches` cover the job boards. A host permission added in an update
    // disables the extension until each user re-approves it, so the first store
    // version must not carry a dev grant or a duplicate of those.
    expect(manifest.host_permissions ?? []).toEqual([]);
    expect(JSON.stringify(manifest)).not.toContain('localhost');
  });
});

describe('buildManifest permissions', () => {
  it('signs in through the identity API on Chrome', () => {
    const { permissions } = buildManifest({ browser: 'chrome', command: 'build' });

    expect(permissions).toEqual(['storage', 'activeTab', 'identity']);
  });

  it('reads its sign-in tab on Safari, which has no identity API', () => {
    const { permissions } = buildManifest({ browser: 'safari', command: 'build' });

    expect(permissions).toEqual(['storage', 'activeTab', 'tabs']);
  });
});
