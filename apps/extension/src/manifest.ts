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
    ...(command === 'serve' && { host_permissions: [DEV_API_HOST_PERMISSION] }),
    icons: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  };
}
