import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareShots, extractShotNames, hasShotMismatch, imageNamesIn } from '@trakwyn/content';
import { GUIDES_DIR, listGuides } from '@trakwyn/content/node';

describe('extractShotNames', () => {
  it('lists the literal names passed to shot(page, …)', () => {
    const script = `
      await shot(page, 'board');
      await shot(page, "application-detail", { locator });
      await shot( page ,'new-application');
    `;
    expect(extractShotNames(script)).toEqual(['board', 'application-detail', 'new-application']);
  });

  it('ignores names it cannot read statically and other calls', () => {
    const script = `
      await shot(page, name);
      await shot(page, \`board\`);
      await reshot(page, 'nope');
      await shot(otherPage, 'nope-either');
      await shot(page, 'Not_Kebab');
    `;
    expect(extractShotNames(script)).toEqual([]);
  });
});

describe('imageNamesIn', () => {
  it('lists the image names a guide shows, without the extension', () => {
    expect(imageNamesIn('![a](./board.webp) and ![b](./new-application.webp)')).toEqual([
      'board',
      'new-application',
    ]);
  });

  it('ignores anything but a relative .webp', () => {
    expect(imageNamesIn('![a](https://x.test/a.webp) ![b](./nested/b.webp) ![c](./c.png)')).toEqual(
      [],
    );
  });
});

describe('compareShots', () => {
  it('passes when the Markdown and the script name the same images', () => {
    const result = compareShots(['a', 'b'], ['b', 'a']);
    expect(hasShotMismatch(result)).toBe(false);
  });

  it('reports a Markdown image with no shot()', () => {
    const result = compareShots(['a', 'b'], ['a']);
    expect(result.missingFromScript).toEqual(['b']);
    expect(hasShotMismatch(result)).toBe(true);
  });

  it('reports a shot() the Markdown never shows', () => {
    const result = compareShots(['a'], ['a', 'extra']);
    expect(result.missingFromMarkdown).toEqual(['extra']);
    expect(hasShotMismatch(result)).toBe(true);
  });

  it('reports a name taken twice', () => {
    const result = compareShots(['a'], ['a', 'a']);
    expect(result.duplicated).toEqual(['a']);
    expect(hasShotMismatch(result)).toBe(true);
  });
});

describe('published guides', () => {
  const guides = listGuides({ includeDrafts: true });

  it('has at least one guide to check', () => {
    expect(guides.length).toBeGreaterThanOrEqual(2);
  });

  it.each(guides.map((g) => g.slug))('%s has a guide.ts that takes exactly its images', (slug) => {
    const script = join(GUIDES_DIR, slug, 'guide.ts');
    expect(existsSync(script), `${slug} has no guide.ts`).toBe(true);
    const markdown = readFileSync(join(GUIDES_DIR, slug, 'index.md'), 'utf8');
    const mismatch = compareShots(
      imageNamesIn(markdown),
      extractShotNames(readFileSync(script, 'utf8')),
    );
    expect(mismatch, slug).toEqual({
      missingFromScript: [],
      missingFromMarkdown: [],
      duplicated: [],
    });
  });
});
