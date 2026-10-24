import { describe, expect, it } from 'vitest';
import { API_URLS } from './apiUrls';
import {
  buildManifest,
  FIREFOX_ADDON_ID,
  FIREFOX_MIN_VERSION,
  WEB_STORE_PUBLIC_KEY,
} from './manifest';

const WEB_STORE_EXTENSION_ID = 'pnpgngnojencbggokjhpfhmliijakmhe';

const DEV_HOST_PERMISSION = `${new URL(API_URLS.DEVELOPMENT).origin}/*`;

describe('buildManifest host permissions', () => {
  it('lets a dev build reach the local API', () => {
    const manifest = buildManifest({ browser: 'chrome', command: 'serve' });

    expect(manifest.host_permissions).toEqual([DEV_HOST_PERMISSION]);
  });

  it.each(['chrome', 'safari', 'firefox'])(
    'asks a %s production build for no host permission',
    (browser) => {
      const manifest = buildManifest({ browser, command: 'build' });

      // The API answers extension origins through CORS, and the content script's
      // own `matches` cover the job boards. A host permission added in an update
      // disables the extension until each user re-approves it, so the first store
      // version must not carry a dev grant or a duplicate of those.
      expect(manifest.host_permissions ?? []).toEqual([]);
      expect(JSON.stringify(manifest)).not.toContain('localhost');
    },
  );
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

  it('signs in in a tab on Firefox, so it asks for tabs and not identity', () => {
    // Firefox only exposes `browser.identity` when the manifest asks for it, so
    // leaving `identity` out sends it down the same tab flow as Safari. Its
    // `launchWebAuthFlow` redirect (`*.extensions.allizom.org`) is not one the
    // API will redirect to.
    const { permissions } = buildManifest({ browser: 'firefox', command: 'build' });

    expect(permissions).toEqual(['storage', 'activeTab', 'tabs']);
  });
});

describe('buildManifest Firefox settings', () => {
  const gecko = () =>
    (
      buildManifest({ browser: 'firefox', command: 'build' }) as {
        browser_specific_settings?: {
          gecko?: {
            id?: string;
            strict_min_version?: string;
            data_collection_permissions?: { required?: string[]; optional?: string[] };
          };
        };
      }
    ).browser_specific_settings?.gecko;

  it('pins the add-on ID, which is permanent once published', () => {
    expect(gecko()?.id).toBe(FIREFOX_ADDON_ID);
  });

  it('requires a Firefox that knows data_collection_permissions', () => {
    expect(gecko()?.strict_min_version).toBe(FIREFOX_MIN_VERSION);
  });

  it('declares the data the store listing discloses', () => {
    // AMO requires the declaration for a new add-on. It matches the Web Store
    // data-usage answers in store/listing.md and the privacy policy.
    expect(gecko()?.data_collection_permissions?.required).toEqual([
      'personallyIdentifyingInfo',
      'authenticationInfo',
      'websiteContent',
    ]);
  });

  it.each(['chrome', 'safari'])('leaves a %s build without Gecko settings', (browser) => {
    expect(buildManifest({ browser, command: 'build' })).not.toHaveProperty(
      'browser_specific_settings',
    );
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

  it.each(['safari', 'firefox'])('leaves %s without a key', (browser) => {
    // The key is the Web Store's; Firefox derives its ID from the Gecko one.
    expect(buildManifest({ browser, command: 'build' }).key).toBeUndefined();
  });
});
