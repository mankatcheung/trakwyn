import { describe, expect, it } from 'vitest';
import { allGuideTags, getGuide, GUIDES, guideImageUrl, loadGuides } from '#/lib/guides';

const FILE = (extra = '', body = 'Hello.') => `---
title: T
description: D
date: 2026-01-01
tags: [a]
${extra}---

${body}
`;
const PATH = (slug: string, file = 'index.md') => `../../../../content/guides/en/${slug}/${file}`;

describe('loadGuides', () => {
  it('parses each guide and sorts newest first', () => {
    const { guides } = loadGuides(
      {
        [PATH('old')]: FILE(),
        [PATH('new')]: FILE().replace('2026-01-01', '2026-03-01'),
      },
      {},
      false,
    );
    expect(guides.map((g) => g.slug)).toEqual(['new', 'old']);
  });

  it('leaves drafts out unless asked', () => {
    const markdown = { [PATH('wip')]: FILE('draft: true\n'), [PATH('live')]: FILE() };
    expect(loadGuides(markdown, {}, false).guides.map((g) => g.slug)).toEqual(['live']);
    expect(
      loadGuides(markdown, {}, true)
        .guides.map((g) => g.slug)
        .sort(),
    ).toEqual(['live', 'wip']);
  });

  it('names the file when the frontmatter is invalid', () => {
    expect(() =>
      loadGuides({ [PATH('bad')]: FILE().replace('title: T\n', '') }, {}, false),
    ).toThrow(/guides\/en\/bad\/index\.md/);
  });

  it('fails when a Markdown image has no matching file', () => {
    const markdown = { [PATH('g')]: FILE('', '![alt](./missing.webp)') };
    expect(() => loadGuides(markdown, {}, false)).toThrow(/missing\.webp/);
  });

  it('resolves an image that exists, even for a draft', () => {
    const markdown = { [PATH('g')]: FILE('draft: true\n', '![alt](./a.webp)') };
    const images = { [PATH('g', 'a.webp')]: '/assets/a-hash.webp' };
    const loaded = loadGuides(markdown, images, true);
    expect(loaded.images.get('g')?.get('a.webp')).toBe('/assets/a-hash.webp');
  });
});

describe('the bundled guides', () => {
  it('include the two first guides, resolvable by slug', () => {
    expect(getGuide('track-your-first-job-application')?.frontmatter.title).toBe(
      'Track your first job application',
    );
    expect(getGuide('tailor-a-cover-letter-to-a-job-posting')).toBeDefined();
    expect(getGuide('nope')).toBeUndefined();
  });

  it('resolve a guide image through the one lookup', () => {
    expect(guideImageUrl('track-your-first-job-application', './board.webp')).toMatch(
      /board.*\.webp/,
    );
    expect(guideImageUrl('track-your-first-job-application', './nope.webp')).toBeUndefined();
  });

  it('collect a sorted, unique tag list', () => {
    const tags = allGuideTags(GUIDES);
    expect(tags).toEqual([...new Set(tags)].sort());
    expect(tags).toContain('tracking');
  });
});
