import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDE_SLUG_PATTERN, parseGuide, type Guide } from './index';

/** Node-only: the repo's `content/` folder. Browser code uses import.meta.glob. */
// `import.meta.dirname` first: under jsdom (Vitest) `import.meta.url` is not a file URL.
const SRC_DIR = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
export const CONTENT_ROOT = join(SRC_DIR, '..');
export const GUIDES_DIR = join(CONTENT_ROOT, 'guides', 'en');

/**
 * Every guide under `guides/en/<slug>/index.md`, sorted newest first. Drafts
 * are left out unless `includeDrafts`. Throws on a bad slug or frontmatter.
 */
export function listGuides({ includeDrafts = false } = {}): Guide[] {
  if (!existsSync(GUIDES_DIR)) return [];
  const guides: Guide[] = [];
  for (const entry of readdirSync(GUIDES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    if (!GUIDE_SLUG_PATTERN.test(slug)) throw new Error(`Invalid guide slug "${slug}"`);
    const file = join(GUIDES_DIR, slug, 'index.md');
    let parsed;
    try {
      parsed = parseGuide(readFileSync(file, 'utf8'));
    } catch (error) {
      throw new Error(`guides/en/${slug}/index.md: ${(error as Error).message}`, { cause: error });
    }
    if (parsed.frontmatter.draft && !includeDrafts) continue;
    guides.push({ slug, ...parsed });
  }
  return guides.sort(
    (a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date) || a.slug.localeCompare(b.slug),
  );
}

/** nitro `routeRules` for every published guide page: `/guides/<slug>` prerendered. */
export function guideRouteRules(): Record<string, { prerender: true }> {
  return Object.fromEntries(listGuides().map((g) => [`/guides/${g.slug}`, { prerender: true }]));
}
