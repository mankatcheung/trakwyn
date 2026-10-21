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
    permissions: ['storage', 'activeTab', ...(browser === 'safari' ? ['tabs'] : ['identity'])],
    ...(browser !== 'safari' && { key: WEB_STORE_PUBLIC_KEY }),
    ...(command === 'serve' && { host_permissions: [DEV_API_HOST_PERMISSION] }),
    icons: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  };
}
