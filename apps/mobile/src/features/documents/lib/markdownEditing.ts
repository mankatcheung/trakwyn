import { isSafeMarkdownUrl } from '../../../lib/safeMarkdownUrl';

export interface Selection {
  start: number;
  end: number;
}

export interface TextEdit {
  text: string;
  selection: Selection;
}

/**
 * Toolbar model for the mobile draft editor: plain text with lightweight
 * Markdown-style markers (`**bold**`, `*italic*`, `# `/`## `/`### `
 * headings, `- ` bullets, `1. ` numbered items) rather than the web editor's
 * ProseMirror document — there is no rich-text engine on React Native, and
 * this keeps the toolbar buttons genuinely functional instead of decorative.
 */
export function wrapSelection(text: string, selection: Selection, marker: string): TextEdit {
  const { start, end } = selection;
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);

  return {
    text: `${before}${marker}${selected}${marker}${after}`,
    selection:
      selected.length > 0
        ? { start, end: end + marker.length * 2 }
        : { start: start + marker.length, end: start + marker.length },
  };
}

function lineBoundsAt(text: string, position: number): { start: number; end: number } {
  const start = text.lastIndexOf('\n', position - 1) + 1;
  const nextBreak = text.indexOf('\n', position);
  const end = nextBreak === -1 ? text.length : nextBreak;
  return { start, end };
}

/** Toggles `prefix` at the start of the line the cursor is on. */
export function toggleLinePrefix(text: string, selection: Selection, prefix: string): TextEdit {
  const { start: lineStart, end: lineEnd } = lineBoundsAt(text, selection.start);
  const line = text.slice(lineStart, lineEnd);
  const hasPrefix = line.startsWith(prefix);

  const newLine = hasPrefix ? line.slice(prefix.length) : `${prefix}${line}`;
  const delta = newLine.length - line.length;

  return {
    text: text.slice(0, lineStart) + newLine + text.slice(lineEnd),
    selection: {
      start: Math.max(lineStart, selection.start + delta),
      end: Math.max(lineStart, selection.end + delta),
    },
  };
}

/**
 * The URL a typed link points at, or null when it is not one the app opens
 * (JEF-589). A bare `example.com` gets `https://`; `javascript:`, `data:` and the
 * like are refused, as `isSafeMarkdownUrl` does everywhere else.
 */
export function normalizeLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '' || /\s/.test(trimmed) || /[()<>]/.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return isSafeMarkdownUrl(withScheme) ? withScheme : null;
}

/**
 * Turns the selection into `[selected](url)`, or inserts `[url](url)` at the
 * cursor. Null when the URL is not safe.
 */
export function insertLink(text: string, selection: Selection, rawUrl: string): TextEdit | null {
  const url = normalizeLinkUrl(rawUrl);
  if (!url) return null;
  const { start, end } = selection;
  const label = end > start ? text.slice(start, end) : url;
  const link = `[${label}](${url})`;
  const caret = start + link.length;
  return {
    text: `${text.slice(0, start)}${link}${text.slice(end)}`,
    selection: { start: caret, end: caret },
  };
}
