import { describe, it, expect } from 'vitest';
import {
  documentCategory,
  DOCUMENT_CATEGORIES,
  UPLOAD_TYPES_BY_CATEGORY,
} from '#/lib/documentCategory';

describe('documentCategory', () => {
  it.each([
    ['cover_letter', 'cover_letter'],
    ['resume', 'resume'],
    ['portfolio', 'other'],
    ['other', 'other'],
    ['', 'other'],
    ['some_future_type', 'other'],
  ] as const)('puts %j in %s', (type, expected) => {
    expect(documentCategory(type)).toBe(expected);
  });

  it('only offers upload types that map back to the same category', () => {
    // A type offered by a tab that lands in a different one would make an
    // upload disappear from the tab it was made in.
    for (const category of DOCUMENT_CATEGORIES) {
      for (const type of UPLOAD_TYPES_BY_CATEGORY[category]) {
        expect(documentCategory(type)).toBe(category);
      }
    }
  });
});
