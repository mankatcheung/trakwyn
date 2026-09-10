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
