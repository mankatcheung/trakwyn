import { extractImages, parseGuide, type Guide } from '@trakwyn/content';

/**
 * The guides (JEF-531): Markdown files under `content/guides/en/<slug>/`,
 * read at build time so they are bundled and prerendered. The build fails on
 * invalid frontmatter, a duplicate slug or an image reference with no file.
 */

const MARKDOWN = import.meta.glob('../../../../content/guides/en/*/index.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const IMAGES = import.meta.glob('../../../../content/guides/en/*/*.webp', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const SLUG_FROM_PATH = /guides\/en\/([^/]+)\//;

function slugOf(path: string): string {
  const slug = SLUG_FROM_PATH.exec(path)?.[1];
  if (!slug) throw new Error(`Not a guide path: ${path}`);
  return slug;
}

/** `{ slug: { 'x.webp': url } }` from the image glob. */
function groupImages(images: Record<string, string>): Map<string, Map<string, string>> {
  const bySlug = new Map<string, Map<string, string>>();
  for (const [path, url] of Object.entries(images)) {
    const slug = slugOf(path);
    const files = bySlug.get(slug) ?? new Map<string, string>();
    files.set(path.slice(path.lastIndexOf('/') + 1), url);
    bySlug.set(slug, files);
  }
  return bySlug;
}

export interface LoadedGuides {
  guides: Guide[];
  /** `slug -> filename -> hashed URL`, for the Markdown `img` override. */
  images: Map<string, Map<string, string>>;
}

/** Pure so tests can feed it fixtures; the module-level call uses the globs. */
export function loadGuides(
  markdown: Record<string, string>,
  images: Record<string, string>,
  includeDrafts: boolean,
): LoadedGuides {
  const imagesBySlug = groupImages(images);
  const seen = new Set<string>();
  const guides: Guide[] = [];

  for (const [path, raw] of Object.entries(markdown)) {
    const slug = slugOf(path);
    if (seen.has(slug)) throw new Error(`Duplicate guide slug "${slug}"`);
    seen.add(slug);

    let parsed;
    try {
      parsed = parseGuide(raw);
    } catch (error) {
      throw new Error(`guides/en/${slug}/index.md: ${(error as Error).message}`, { cause: error });
    }

    for (const { src } of extractImages(parsed.body)) {
      const file = src.replace(/^\.\//, '');
      if (!imagesBySlug.get(slug)?.has(file)) {
        throw new Error(`guides/en/${slug}/index.md: image "${src}" has no matching .webp file`);
      }
    }
    if (parsed.frontmatter.draft && !includeDrafts) continue;
    guides.push({ slug, ...parsed });
  }

  guides.sort(
    (a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date) || a.slug.localeCompare(b.slug),
  );
  return { guides, images: imagesBySlug };
}

const loaded = loadGuides(MARKDOWN, IMAGES, import.meta.env.DEV);

export const GUIDES: readonly Guide[] = loaded.guides;

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

/** The URL of `./file.webp` in a guide's folder, or undefined when absent. */
export function guideImageUrl(slug: string, src: string): string | undefined {
  return loaded.images.get(slug)?.get(src.replace(/^\.\//, ''));
}

export function allGuideTags(guides: readonly Guide[] = GUIDES): string[] {
  return [...new Set(guides.flatMap((g) => g.frontmatter.tags))].sort();
}
