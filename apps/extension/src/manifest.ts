import type { UserManifest } from 'wxt';
import { API_URLS } from './apiUrls';

interface ManifestEnv {
  /** `chrome`, `safari`, …; the one place the browsers' manifests differ. */
  browser: string;
  /** `serve` for `wxt` dev, `build` for a build or a zip. */
  command: 'build' | 'serve';
}

/** The local API, reachable only from the dev server's build. */
const DEV_API_HOST_PERMISSION = `${new URL(API_URLS.DEVELOPMENT).origin}/*`;

/**
 * The Web Store listing's public key (dashboard, Package tab; JEF-415). Chrome
 * derives the extension ID from it, so any Chrome build, including an unpacked
 * one, gets the store's permanent ID, which is the one in the API's
 * `EXTENSION_OAUTH_IDS`. It is public by design; the private key stays with
 * the store.
 */
export const WEB_STORE_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlEcX88Q9Ykk3VB01hUlwF2e2TM14iN/3hGgwyevxlC/EIBjV7GC8335GSIcwtXPPAay5B2efpE5qDgpVYMzg5R+NDQC56swoym7LgA3vHrK/XkLJgkKT50xE4ZJ9FuaLdlMIlDVG9bDH01pICMy0aNOC0IIema4x2GXr153XFVQLlUKswjKLl3dyoHZFCf0TKBeK5sSB3JgyneezQ0OhdG5Jeu3x7E5MNq/SW/V9e1n924NbBzWiHY7iC4hFWMWk5JUqamwxoPN+ZmbrgCawb0DS/nKQ+IaXgFSV4Q9jAwa+et7rHXperspdxyk+4+riIjmi0zL7RYKjjypfWveu1QIDAQAB';

/**
 * The add-on ID Firefox (and AMO) know the Clipper by (JEF-423). It is permanent
 * once published: a different one is a different add-on, with no way to move
 * users or reviews across.
 */
export const FIREFOX_ADDON_ID = 'clipper@trakwyn.com';

/**
 * First desktop Firefox that reads `data_collection_permissions`, which AMO
 * requires of a new add-on. It also has MV3 event-page backgrounds and
 * `storage.session`, which the Clipper relies on.
 */
export const FIREFOX_MIN_VERSION = '140.0';

/**
 * What the Clipper collects, in AMO's terms. Held to the Web Store data-usage
 * answers in `store/listing.md` and the privacy policy by `manifest.test.ts`.
 */
const FIREFOX_DATA_COLLECTION: NonNullable<
  NonNullable<
    NonNullable<UserManifest['browser_specific_settings']>['gecko']
  >['data_collection_permissions']
> = {
  required: ['personallyIdentifyingInfo', 'authenticationInfo', 'websiteContent'],
  optional: [],
};

/** Browsers without `identity.launchWebAuthFlow` as far as the Clipper is concerned. */
const TAB_SIGN_IN_BROWSERS = ['safari', 'firefox'];

/**
 * One manifest per browser (JEF-386).
 *
 * Production asks for no `host_permissions`:
 * - The API answers extension origins through CORS (`corsPlugin.ts`), and the
 *   Clipper sends bearer tokens, so no host grant is needed to reach it.
 * - The job boards are covered by the content script's `matches`
 *   (`entrypoints/content.ts`), and the popup reads the tab through `activeTab`.
 *
 * A host permission added in an update disables the extension until each user
 * re-approves it, so the first store version is the one to get right.
 */
export function buildManifest({ browser, command }: ManifestEnv): UserManifest {
  return {
    name: 'Trakwyn Clipper',
    description: 'Save job postings directly to your Trakwyn account.',
    // Safari and Firefox sign in in a tab (src/lib/tabOAuth.ts) and need `tabs`
    // to read its URL. Firefox only exposes `browser.identity` when the manifest
    // asks for it, so leaving it out is what selects that flow there.
    permissions: [
      'storage',
      'activeTab',
      ...(TAB_SIGN_IN_BROWSERS.includes(browser) ? ['tabs'] : ['identity']),
    ],
    ...(browser === 'chrome' && { key: WEB_STORE_PUBLIC_KEY }),
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: FIREFOX_ADDON_ID,
          strict_min_version: FIREFOX_MIN_VERSION,
          data_collection_permissions: FIREFOX_DATA_COLLECTION,
        },
      },
    }),
    ...(command === 'serve' && { host_permissions: [DEV_API_HOST_PERMISSION] }),
    icons: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  };
}
