/** Han, Kana and Hangul: scripts written without spaces between words. */
const UNSPACED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

let segmenter: Intl.Segmenter | null | undefined;

function wordSegmenter(): Intl.Segmenter | null {
  if (segmenter === undefined) {
    segmenter =
      typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'word' })
        : null;
  }
  return segmenter;
}

function countUnspacedWords(token: string): number {
  const found = wordSegmenter();
  if (!found) return token.length;
  let count = 0;
  for (const part of found.segment(token)) if (part.isWordLike) count += 1;
  return count;
}

/**
 * Words in `text`, the way a word processor counts them: runs separated by
 * whitespace, so "well-known" and "don't" are one word each and a lone dash is
 * none. A run in a script written without spaces (Chinese, Japanese, Korean)
 * is split by the browser's dictionary, because counting it as one word would
 * make a whole page read as a handful.
 */
export function countWords(text: string): number {
  let count = 0;
  for (const token of text.split(/\s+/)) {
    if (!HAS_LETTER_OR_DIGIT.test(token)) continue;
    count += UNSPACED_SCRIPT.test(token) ? countUnspacedWords(token) : 1;
  }
  return count;
}
