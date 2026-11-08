import { describe, expect, it } from 'vitest';
import { backlogEntrySchema, parseBacklog } from '@trakwyn/content';
import { listBacklog, listGuides } from '@trakwyn/content/node';

/** The topic backlog the drafting job reads (JEF-533, content/guides/backlog.yml). */

const VALID = `
- slug: restore-from-trash
  title: Restore a deleted application from Trash
  feature: Trash
  notes: Purged after 30 days.
- slug: compare-offers
  title: Compare job offers
  feature: Offers
`;

describe('guide backlog schema', () => {
  it('parses entries, with notes optional', () => {
    const entries = parseBacklog(VALID);
    expect(entries.map((e) => e.slug)).toEqual(['restore-from-trash', 'compare-offers']);
    expect(entries[1].notes).toBeUndefined();
  });

  it('accepts an empty file', () => {
    expect(parseBacklog('')).toEqual([]);
  });

  it.each([
    ['a missing title', { slug: 'a-b', feature: 'x' }],
    ['a missing feature', { slug: 'a-b', title: 'x' }],
    ['a bad slug', { slug: 'Not A Slug', title: 'x', feature: 'x' }],
    ['an unknown key', { slug: 'a-b', title: 'x', feature: 'x', extra: 1 }],
    ['an empty notes string', { slug: 'a-b', title: 'x', feature: 'x', notes: '' }],
  ])('rejects %s', (_name, entry) => {
    expect(backlogEntrySchema.safeParse(entry).success).toBe(false);
  });

  it('rejects a repeated slug', () => {
    expect(() =>
      parseBacklog(`${VALID}- slug: compare-offers\n  title: Again\n  feature: Offers\n`),
    ).toThrow(/appears twice/);
  });

  it('rejects a file that is not a list', () => {
    expect(() => parseBacklog('slug: a-b')).toThrow();
  });
});

describe('content/guides/backlog.yml', () => {
  const backlog = listBacklog();

  it('holds 10 to 15 valid topics', () => {
    expect(backlog.length).toBeGreaterThanOrEqual(10);
    expect(backlog.length).toBeLessThanOrEqual(15);
  });

  it('lists no topic that already has a guide', () => {
    const existing = new Set(listGuides({ includeDrafts: true }).map((g) => g.slug));
    expect(backlog.filter((e) => existing.has(e.slug)).map((e) => e.slug)).toEqual([]);
  });
});
