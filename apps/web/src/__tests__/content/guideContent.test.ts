import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { extractImages, guideFrontmatterSchema, parseGuide } from '@trakwyn/content';
import { CONTENT_ROOT, GUIDES_DIR, listGuides } from '@trakwyn/content/node';
import { GUIDE_IMAGE_HEIGHT, GUIDE_IMAGE_WIDTH } from '#/components/marketing/GuideMarkdown';

/** The size and format rules in content/README.md (JEF-531). */
const MAX_IMAGE_BYTES = 300 * 1024;
const MAX_CONTENT_BYTES = 50 * 1024 * 1024;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const VALID = `---
title: A guide
description: What it covers.
date: 2026-01-02
tags: [one]
---

Body text.
`;

describe('guide frontmatter', () => {
  it('parses frontmatter and returns the trimmed body', () => {
    const { frontmatter, body } = parseGuide(VALID);
    expect(frontmatter).toEqual({
      title: 'A guide',
      description: 'What it covers.',
      date: '2026-01-02',
      tags: ['one'],
    });
    expect(body).toBe('Body text.');
  });

  it('accepts optional fields', () => {
    const { frontmatter } = parseGuide(
      VALID.replace(
        'tags: [one]',
        'tags: [one]\nupdated: 2026-02-03\nfeature: /features/tracking\ndraft: true',
      ),
    );
    expect(frontmatter.updated).toBe('2026-02-03');
    expect(frontmatter.feature).toBe('/features/tracking');
    expect(frontmatter.draft).toBe(true);
  });

  it('rejects a file with no frontmatter block', () => {
    expect(() => parseGuide('# Just a heading')).toThrow(/frontmatter/);
  });

  it.each([
    ['a missing title', VALID.replace('title: A guide\n', '')],
    ['an empty tag list', VALID.replace('tags: [one]', 'tags: []')],
    ['a malformed date', VALID.replace('2026-01-02', 'January 2')],
    ['an unknown key', VALID.replace('tags: [one]', 'tags: [one]\nauthor: me')],
    ['a feature outside /features', VALID.replace('tags: [one]', 'tags: [one]\nfeature: /pricing')],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseGuide(raw)).toThrow();
  });

  it('exposes the schema for callers that validate on their own', () => {
    expect(guideFrontmatterSchema.safeParse({}).success).toBe(false);
  });
});

describe('extractImages', () => {
  it('lists the alt text and source of each Markdown image', () => {
    expect(extractImages('![A board](./board.webp) and ![](./b.webp "t")')).toEqual([
      { alt: 'A board', src: './board.webp' },
      { alt: '', src: './b.webp' },
    ]);
  });

  it('skips links, unclosed images and images with no source', () => {
    expect(
      extractImages('[link](./a.webp) ![open](./b.webp ![](x y z) ![no paren]\n![ok](./c.webp)'),
    ).toEqual([{ alt: 'ok', src: './c.webp' }]);
    expect(extractImages('![alt](')).toEqual([]);
    expect(extractImages('![alt')).toEqual([]);
  });

  it('keeps an image whose alt text contains an opening ![', () => {
    expect(extractImages('![a ![b](./x.webp)')).toEqual([{ alt: 'a ![b', src: './x.webp' }]);
  });

  it('stays linear on the repetitive input CodeQL flagged', () => {
    const started = performance.now();
    extractImages('!['.repeat(200_000));
    extractImages('![\\'.repeat(100_000));
    extractImages('![](!'.repeat(100_000));
    extractImages('![](![](!'.repeat(50_000));
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('listGuides', () => {
  it('finds the published guides, newest first, with no drafts', () => {
    const guides = listGuides();
    expect(guides.length).toBeGreaterThanOrEqual(2);
    expect(guides.every((g) => !g.frontmatter.draft)).toBe(true);
    const dates = guides.map((g) => g.frontmatter.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('uses the folder name as the slug', () => {
    for (const guide of listGuides({ includeDrafts: true })) {
      expect(guide.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

describe('content budget', () => {
  const files = walk(CONTENT_ROOT).filter((f) => !f.includes('node_modules'));
  const guideFiles = files.filter((f) => f.startsWith(GUIDES_DIR));
  const images = guideFiles.filter((f) => !f.endsWith('index.md'));

  it('keeps content/ within the repo budget', () => {
    const total = files.reduce((sum, f) => sum + statSync(f).size, 0);
    expect(total).toBeLessThanOrEqual(MAX_CONTENT_BYTES);
  });

  it('holds only index.md and .webp images inside a guide folder', () => {
    for (const file of guideFiles) {
      expect(file, relative(CONTENT_ROOT, file)).toMatch(/\/(index\.md|[^/]+\.webp)$/);
    }
  });

  it('keeps every image within 300 KB', () => {
    for (const file of images) {
      expect(statSync(file).size, relative(CONTENT_ROOT, file)).toBeLessThanOrEqual(
        MAX_IMAGE_BYTES,
      );
    }
  });

  it('exports every image at the size GuideMarkdown reserves', async () => {
    for (const file of images) {
      const { width, height } = await sharp(file).metadata();
      expect([width, height], relative(CONTENT_ROOT, file)).toEqual([
        GUIDE_IMAGE_WIDTH,
        GUIDE_IMAGE_HEIGHT,
      ]);
    }
  });

  it('gives every Markdown image alt text and an existing file', () => {
    for (const guide of listGuides({ includeDrafts: true })) {
      for (const { alt, src } of extractImages(guide.body)) {
        expect(alt, `${guide.slug}: ${src} alt text`).not.toBe('');
        expect(src, `${guide.slug}: ${src}`).toMatch(/^\.\/[^/]+\.webp$/);
        expect(() => statSync(join(GUIDES_DIR, guide.slug, src))).not.toThrow();
      }
    }
  });

  it('leaves no image unreferenced', () => {
    const referenced = new Set(
      listGuides({ includeDrafts: true }).flatMap((guide) =>
        extractImages(readFileSync(join(GUIDES_DIR, guide.slug, 'index.md'), 'utf8')).map(
          ({ src }) => join(GUIDES_DIR, guide.slug, src),
        ),
      ),
    );
    for (const file of images) {
      expect(referenced.has(file), `unreferenced: ${relative(CONTENT_ROOT, file)}`).toBe(true);
    }
  });
});
