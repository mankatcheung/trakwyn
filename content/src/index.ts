import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/** Guide slugs are folder names: lowercase words joined by single hyphens. */
export const GUIDE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isoDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD'),
  // The YAML parser reads an unquoted 2026-11-08 as a Date.
  z.date().transform((d) => d.toISOString().slice(0, 10)),
]);

export const guideFrontmatterSchema = z.strictObject({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(200),
  date: isoDate,
  updated: isoDate.optional(),
  tags: z.array(z.string().min(1)).min(1),
  /** A marketing feature page path, e.g. `/features/tracking`. */
  feature: z
    .string()
    .regex(/^\/features(\/[a-z-]+)?$/, 'must be a /features page')
    .optional(),
  draft: z.boolean().optional(),
});

export type GuideFrontmatter = z.infer<typeof guideFrontmatterSchema>;

export interface ParsedGuide {
  frontmatter: GuideFrontmatter;
  body: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Splits the leading `---` block from the Markdown and validates it. */
export function parseGuide(raw: string): ParsedGuide {
  const match = FRONTMATTER.exec(raw);
  if (!match) throw new Error('Guide has no --- frontmatter block');
  const frontmatter = guideFrontmatterSchema.parse(parseYaml(match[1]) ?? {});
  return { frontmatter, body: raw.slice(match[0].length).trim() };
}

/** Relative image references (`./x.webp`) in a Markdown body, with alt text. */
export function extractImages(body: string): { alt: string; src: string }[] {
  // A linear scan, not one regex: `![` repeated many times would make a regex
  // with `[^\]]*` followed by `\](` run in polynomial time (CodeQL, JEF-531).
  // Every `![` before the same `]` shares that `]`, so a failed match skips
  // past it and nothing is scanned twice.
  const images: { alt: string; src: string }[] = [];
  const target = /^(\S+)(?:\s+"[^"]*")?$/;
  let pos = 0;
  for (;;) {
    const start = body.indexOf('![', pos);
    if (start < 0) break;
    const altEnd = body.indexOf(']', start + 2);
    if (altEnd < 0) break;
    pos = altEnd + 1;
    if (body[pos] !== '(') continue;
    const close = body.indexOf(')', pos + 1);
    if (close < 0) break;
    const parts = target.exec(body.slice(pos + 1, close));
    if (!parts) continue;
    images.push({ alt: body.slice(start + 2, altEnd), src: parts[1] });
    pos = close + 1;
  }
  return images;
}

export interface Guide extends ParsedGuide {
  slug: string;
}

/**
 * The names passed to `shot(page, '<name>')` in a guide's `guide.ts` (JEF-532).
 * Only a literal name counts: the script and the Markdown are matched by text,
 * so a computed name would hide a screenshot from the cross-check.
 */
export function extractShotNames(script: string): string[] {
  const names: string[] = [];
  const call = /\bshot\(\s*page\s*,\s*(['"])([a-z0-9]+(?:-[a-z0-9]+)*)\1/g;
  for (const match of script.matchAll(call)) names.push(match[2]);
  return names;
}

/** The image names (`./name.webp` without the extension) a guide's Markdown shows. */
export function imageNamesIn(body: string): string[] {
  return extractImages(body).flatMap(({ src }) => {
    const match = /^\.\/([^/]+)\.webp$/.exec(src);
    return match ? [match[1]] : [];
  });
}

export interface ShotMismatch {
  /** In `index.md` but never taken by the script. */
  missingFromScript: string[];
  /** Taken by the script but not shown in `index.md`. */
  missingFromMarkdown: string[];
  /** Taken more than once, so the later one overwrites the earlier. */
  duplicated: string[];
}

/** Compares a guide's Markdown images with the shots its script takes. */
export function compareShots(markdownNames: string[], scriptNames: string[]): ShotMismatch {
  const inMarkdown = new Set(markdownNames);
  const inScript = new Set(scriptNames);
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const name of scriptNames) {
    if (seen.has(name)) duplicated.add(name);
    seen.add(name);
  }
  return {
    missingFromScript: [...inMarkdown].filter((n) => !inScript.has(n)),
    missingFromMarkdown: [...inScript].filter((n) => !inMarkdown.has(n)),
    duplicated: [...duplicated],
  };
}

export function hasShotMismatch(m: ShotMismatch): boolean {
  return m.missingFromScript.length + m.missingFromMarkdown.length + m.duplicated.length > 0;
}
