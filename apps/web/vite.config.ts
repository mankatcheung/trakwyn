import { defineConfig } from 'vite';
import { devtools } from '@tanstack/devtools-vite';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { nitro } from 'nitro/vite';

import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// PostHog tags every event with `release` (lib/analytics). Vite only exposes
// VITE_-prefixed vars to the client, and Vercel does not expand
// `$VERCEL_GIT_COMMIT_SHA` inside a dashboard value, so derive it here. An
// explicitly set VITE_APP_RELEASE still wins. Guarded because assigning
// `undefined` to process.env stores the string "undefined".
if (!process.env.VITE_APP_RELEASE && process.env.VERCEL_GIT_COMMIT_SHA) {
  process.env.VITE_APP_RELEASE = process.env.VERCEL_GIT_COMMIT_SHA;
}

const config = defineConfig(({ command }) => ({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    tailwindcss(),
    // `router.semicolons` matches this repo's Prettier style (`semi: true`)
    // — without it, the generator's own default (no semicolons) means the
    // committed routeTree.gen.ts perpetually diffs against what `pnpm dev`/
    // `pnpm build` regenerate. tsr.config.json alone does NOT cover this:
    // this plugin resolves its own router config independently and does not
    // read that file for the dev/build code path.
    tanstackStart({ router: { semicolons: true } }),
    // nitro() enables platform-targeted build output (Vercel, Netlify, etc.) —
    // without it, `vite build` only emits a generic dist/server/server.js
    // fetch handler with no adapter for any specific hosting platform.
    // preset: 'vercel' is explicit, not auto-detected — this nitro version
    // (unlike unjs/nitropack, which Nuxt uses) has no VERCEL=1 auto-detection,
    // confirmed by a real `vercel build` run producing a generic .output/
    // instead of .vercel/output/ (Build Output API v3) without this.
    // Restricted to `build`: nitro also resolves 'vercel' to its 'vercel-dev'
    // alias for `vite dev`, emulating the Vercel runtime locally — skipped
    // here so `pnpm dev` runs as a plain local dev server instead.
    ...(command === 'build'
      ? [
          nitro({
            preset: 'vercel',
            // Prerender every marketing page at build time (JEF-169, extended
            // to the full set) so each is emitted as a real HTML file under
            // .vercel/output/static/. The Vercel route config puts
            // `handle: filesystem` ahead of the `/(.*) -> /__server`
            // fallback, so those files are served straight from the edge —
            // the serverless function is never invoked for them.
            //
            // Measured before this (JEF-168): documents returned
            // `x-vercel-cache: MISS` on every request with
            // `cache-control: max-age=0, must-revalidate`, so every
            // anonymous visit invoked the function and paid a London->
            // Virginia hop. Warm TTFB ~150 ms, one cold start at 1.18 s.
            //
            // Every path here is a marketing page that SSRs unconditionally
            // (none sets `ssr: false`), so the prerendered HTML carries the
            // real content — hero copy, feature text, policy documents — and
            // crawlers index it without executing JS. This invariant is
            // enforced by src/__tests__/routes/marketingSsr.test.ts; if a
            // route below ever gains an auth gate or client-only cookie
            // check, remove it from this list in the same change.
            routeRules: {
              '/': { prerender: true },
              '/features': { prerender: true },
              '/features/tracking': { prerender: true },
              '/features/ai-assistant': { prerender: true },
              '/features/resume-cover-letter': { prerender: true },
              '/features/analytics': { prerender: true },
              '/privacy': { prerender: true },
              '/terms': { prerender: true },
              '/accessibility': { prerender: true },
              '/ai-mcp-setup': { prerender: true },
            },
          }),
        ]
      : []),
    viteReact(),
  ],
  server: {
    proxy: {
      '/graphql': { target: 'http://localhost:3001', changeOrigin: true },
      '/auth': { target: 'http://localhost:3001', changeOrigin: true },
      '/oauth': { target: 'http://localhost:3001', changeOrigin: true },
      '/chat/stream': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
}));

export default config;
