import { describe, expect, it } from 'vitest';
import { API_URLS } from './apiUrls';
import { buildManifest, WEB_STORE_PUBLIC_KEY } from './manifest';

const WEB_STORE_EXTENSION_ID = 'pnpgngnojencbggokjhpfhmliijakmhe';

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

describe('buildManifest key', () => {
  it.each(['build', 'serve'] as const)('pins a Chrome %s to the Web Store ID', (command) => {
    const manifest = buildManifest({ browser: 'chrome', command });

    expect(manifest.key).toBe(WEB_STORE_PUBLIC_KEY);
  });

  it('derives the Web Store ID from the key', async () => {
    // Chrome's rule: the first 128 bits of the SHA-256 of the DER key, as a-p.
    const der = Uint8Array.from(atob(WEB_STORE_PUBLIC_KEY), (c) => c.charCodeAt(0));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', der));
    const id = [...digest.slice(0, 16)]
      .map((b) => (b >> 4).toString(16) + (b & 15).toString(16))
      .join('')
      .replace(/[0-9a-f]/g, (h) => String.fromCharCode(97 + parseInt(h, 16)));

    expect(id).toBe(WEB_STORE_EXTENSION_ID);
  });

  it('leaves Safari without a key', () => {
    expect(buildManifest({ browser: 'safari', command: 'build' }).key).toBeUndefined();
  });
});
