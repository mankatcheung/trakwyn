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
  return [...body.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => ({
    alt: m[1],
    src: m[2],
  }));
}

export interface Guide extends ParsedGuide {
  slug: string;
}
