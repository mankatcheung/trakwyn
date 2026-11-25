import { describe, expect, it } from 'vitest';
import { appSourceFiles, matchingLines } from '../helpers/sourceFiles';

/**
 * No sparkle marks an AI feature (JEF-693). The ✦ icon is the most recognisable sign of a
 * generated product, and it named nothing: a button that drafts text, one that lists
 * questions and the page that holds provider keys all wore the same glyph. Each now carries
 * an icon for what it does, or none. This covers the lucide icon, in any import style, and
 * the ✨ emoji.
 */
const SPARKLE = /\bSparkles?(?:Icon)?\b|✨|lucide-sparkles?/;

describe('no sparkle icons (JEF-693)', () => {
  const files = appSourceFiles();

  it('reads the source of both packages', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('uses no sparkle icon or ✨ anywhere in the shipped source', () => {
    expect(matchingLines(files, SPARKLE)).toEqual([]);
  });
});
