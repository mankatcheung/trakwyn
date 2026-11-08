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
