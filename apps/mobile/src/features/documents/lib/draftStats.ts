import type { Selection } from './markdownEditing';

/** Han, Kana and Hangul: scripts written without spaces between words. */
const UNSPACED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** The text without the Markdown markers the editor shows (JEF-589). */
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\([^)\s]*\)/g, '$1')
    .replace(/^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d+[.)][ \t]+)/gm, '')
    .replace(/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/gm, '')
    .replace(/(?<!\\)\*\*(.+?)(?<!\\)\*\*/g, '$1')
    .replace(/(?<![A-Za-z0-9_\\])__(.+?)__(?![A-Za-z0-9_])/g, '$1')
    .replace(/(?<!\\)~~(.+?)(?<!\\)~~/g, '$1')
    .replace(/(?<![\\*])\*([^*\s\\](?:[^*]*[^*\s\\])?)\*(?!\*)/g, '$1')
    .replace(/(?<![A-Za-z0-9_\\])_([^_\s\\](?:[^_]*[^_\s\\])?)_(?![A-Za-z0-9_])/g, '$1')
    .replace(/\\([\\*_~[\]#>+.()!-])/g, '$1');
}

/**
 * Words the way a word processor counts them (same as web's `countWords`):
 * whitespace-separated runs with a letter or digit, and each Han, Kana or
 * Hangul run counted by the dictionary when the engine has one, else by
 * character.
 */
export function countWords(text: string): number {
  const segmenter =
    typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter(undefined, { granularity: 'word' })
      : null;
  let count = 0;
  for (const token of text.split(/\s+/)) {
    if (!HAS_LETTER_OR_DIGIT.test(token)) continue;
    if (!UNSPACED_SCRIPT.test(token)) {
      count += 1;
    } else if (!segmenter) {
      count += token.length;
    } else {
      for (const part of segmenter.segment(token)) if (part.isWordLike) count += 1;
    }
  }
  return count;
}

export interface DraftCount {
  words: number;
  characters: number;
  /** The count is of the selected text, not the whole draft. */
  selected: boolean;
}

/** Words and characters of the whole draft, or of the selection while text is selected. */
export function countDraft(markdown: string, selection: Selection): DraftCount {
  const start = Math.min(selection.start, selection.end);
  const end = Math.max(selection.start, selection.end);
  const selected = end > start;
  const plain = stripMarkdown(selected ? markdown.slice(start, end) : markdown).trim();
  return { words: countWords(plain), characters: plain.length, selected };
}
