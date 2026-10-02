import { defineConfig } from 'wxt';

/**
 * One source, one manifest per browser (JEF-386): `wxt build` for Chrome,
 * `wxt build -b safari` for the bundle `scripts/package-safari.sh` wraps in an
 * Xcode project.
 *
 * The browsers differ only in how OAuth sign-in reaches its redirect:
 * - Chrome: `identity.launchWebAuthFlow`.
 * - Safari: has no `identity` API, so it opens a tab and needs `tabs` to read
 *   that tab's URL when the API's origin isn't among the host permissions,
 *   e.g. a self-hosted API URL. See src/lib/tabOAuth.ts.
 */
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  // Keep imports explicit, as in the rest of the monorepo.
  imports: false,
  // WXT defaults Safari to MV2; Safari 17 runs MV3, so both ship the same shape.
  manifestVersion: 3,
  // `pnpm dev` at the root runs every app's `dev`: build and watch, don't
  // launch a browser. Load `.output/chrome-mv3-dev` unpacked instead.
  webExt: { disabled: true },
  manifest: ({ browser }) => ({
    name: 'Trakwyn Clipper',
    description: 'Save job postings directly to your Trakwyn account.',
    permissions: ['storage', 'activeTab', ...(browser === 'safari' ? ['tabs'] : ['identity'])],
    host_permissions: [
      'http://localhost:3001/*',
      'https://*.linkedin.com/*',
      'https://*.indeed.com/*',
      'https://*.glassdoor.com/*',
      'https://*.greenhouse.io/*',
      'https://*.lever.co/*',
      'https://*.workday.com/*',
    ],
    icons: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  }),
});
