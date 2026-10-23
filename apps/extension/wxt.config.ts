import { defineConfig } from 'wxt';
import { buildManifest } from './src/manifest';

/**
 * One source, one manifest per browser (JEF-386): `wxt build` for Chrome,
 * `wxt build -b safari` for the bundle `scripts/package-safari.sh` wraps in an
 * Xcode project. The manifest is `src/manifest.ts`.
 *
 * The browsers differ only in how OAuth sign-in reaches its redirect:
 * - Chrome: `identity.launchWebAuthFlow`.
 * - Safari: has no `identity` API, so it opens a tab and needs `tabs` to read
 *   that tab's URL, since the API's origin is never among the host permissions.
 *   See src/lib/tabOAuth.ts.
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
  // Unset, WXT takes the first free port from 3000, which is the web app's
  // whenever the extension starts first or alone. The API has 3001.
  dev: { server: { port: 3002 } },
  manifest: ({ browser, command }) => buildManifest({ browser, command }),
  hooks: {
    // A build or zip has no default API or web URL (apiUrls.ts), so refuse to produce
    // a bundle that cannot reach one. The dev server uses localhost; `wxt
    // prepare` never builds, so postinstall and typecheck are unaffected.
    // WXT has loaded `.env` into `process.env` by now.
    'build:before': (wxt) => {
      if (wxt.config.command !== 'build') return;
      for (const [name, what] of [
        ['VITE_API_URL', 'the API URL it talks to'],
        ['VITE_WEB_URL', 'the web app URL it links to'],
      ] as const) {
        if (!process.env[name]?.trim()) {
          throw new Error(`${name} is not set: a build needs ${what} (.env.example)`);
        }
      }
    },
  },
});
