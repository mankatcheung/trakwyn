import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the marketing-pages SSR/prerender setup (JEF-169 follow-up):
 *
 * 1. Marketing pages must never set `ssr: false` — they exist to be indexed,
 *    and their prerendered HTML is only real content because the server
 *    renders them unconditionally.
 * 2. Every marketing page must appear in vite.config.ts's nitro `routeRules`
 *    prerender list, and nothing else may — a page missing from the list is
 *    served by the serverless function per request (the JEF-168 cost); a
 *    stale entry prerenders a page that no longer exists.
 *
 * Any new top-level route (outside `_authenticated/`) must be classified here
 * — same forcing function as the architecture tests: the lists below are
 * exhaustive over `src/routes`, so adding a file fails this test until a
 * deliberate decision lands.
 */

const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');
const ROUTES_DIR = join(WEB_ROOT, 'src', 'routes');
const VITE_CONFIG = readFileSync(join(WEB_ROOT, 'vite.config.ts'), 'utf8');

/** Route path → file, for pages that must SSR and be prerendered. */
const PRERENDERED_MARKETING: Record<string, string> = {
  '/': 'index.tsx',
  '/features': 'features/index.tsx',
  '/features/tracking': 'features/tracking.tsx',
  '/features/ai-assistant': 'features/ai-assistant.tsx',
  '/features/resume-cover-letter': 'features/resume-cover-letter.tsx',
  '/features/analytics': 'features/analytics.tsx',
  '/pricing': 'pricing.tsx',
  '/privacy': 'privacy.tsx',
  '/terms': 'terms.tsx',
  '/accessibility': 'accessibility.tsx',
  '/ai-mcp-setup': 'ai-mcp-setup.tsx',
};

/**
 * Every other route file outside `_authenticated/`, with the reason it is
 * NOT in the prerender list. Auth pages opt out of SSR entirely (client-only
 * cookie check); the transactional/token pages are server-rendered but carry
 * per-request query params, so their HTML can't be baked at build time.
 */
const EXCEPTIONS: Record<string, string> = {
  'login.tsx': 'auth page, ssr: false',
  'register.tsx': 'auth page, ssr: false',
  'oauth/authorize.tsx': 'auth flow, ssr: false',
  'forgot-password.tsx': 'token/query-param form',
  'reset-password.tsx': 'token/query-param form',
  'verify-email.tsx': 'token query param',
  'confirm-email-change.tsx': 'token query param',
  'confirm-backup-email.tsx': 'token query param',
  'share.tsx': 'per-token shared summary',
};

/** Walks src/routes, skipping private (-prefixed) files/dirs. */
function discoverRouteFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry.startsWith('-') || entry.startsWith('_')) continue;
    if (statSync(full).isDirectory()) {
      found.push(...discoverRouteFiles(full));
    } else if (entry.endsWith('.tsx')) {
      found.push(relative(ROUTES_DIR, full));
    }
  }
  return found.sort();
}

/** Strips line comments so prose mentioning `ssr: false` doesn't count. */
function withoutComments(source: string): string {
  return source.replace(/^.*\/\/.*$/gm, (line) => line.slice(0, Math.max(0, line.indexOf('//'))));
}

function parsePrerenderedPaths(config: string): string[] {
  return [...config.matchAll(/'(\/[^']*)':\s*\{\s*prerender:\s*true\s*\}/g)].map((m) => m[1]);
}

describe('marketing page SSR/prerender invariant', () => {
  it('every marketing route SSRs (no ssr: false)', () => {
    for (const [path, file] of Object.entries(PRERENDERED_MARKETING)) {
      const source = readFileSync(join(ROUTES_DIR, file), 'utf8');
      expect(withoutComments(source), `${path} (${file})`).not.toMatch(/ssr:\s*false/);
    }
  });

  it('vite.config prerenders exactly the marketing routes', () => {
    expect(parsePrerenderedPaths(VITE_CONFIG).sort()).toEqual(
      Object.keys(PRERENDERED_MARKETING).sort(),
    );
  });

  it('every public route file is classified as marketing or exempt', () => {
    const files = discoverRouteFiles(ROUTES_DIR);
    const marketingFiles = new Set(Object.values(PRERENDERED_MARKETING));

    for (const file of files) {
      if (marketingFiles.has(file)) continue;
      expect(
        EXCEPTIONS,
        `classify ${file}: marketing page (add to PRERENDERED_MARKETING) or exempt with a reason (add to EXCEPTIONS)`,
      ).toHaveProperty(file);
    }

    // No stale exemptions: a deleted route must leave the list too.
    for (const file of Object.keys(EXCEPTIONS)) {
      expect(files, `stale exception ${file}`).toContain(file);
    }
    for (const file of Object.values(PRERENDERED_MARKETING)) {
      expect(files, `PRERENDERED_MARKETING points at missing file ${file}`).toContain(file);
    }
  });
});
