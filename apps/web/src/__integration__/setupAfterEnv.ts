import { installBrowserShim, type BrowserShim } from './support/browserShim';

declare global {
  var __BROWSER_SHIM__: BrowserShim | undefined;
}

// Runs before each test file imports anything, so `graphql/client.ts` sees the
// shim's `window`, `document` and `fetch` when its module body runs.
globalThis.__BROWSER_SHIM__ = installBrowserShim();
