import type { TiptapNode } from '#/lib/markdownToTiptapDoc';

/**
 * Structural hints for a resume (JEF-585). Pure: the Tiptap JSON goes in, a
 * list of hints comes out, so the rules are testable without an editor and
 * could run on the server or mobile later. They never block saving or
 * exporting, and they are advice, not a score.
 */

export interface AtsHint {
  id: 'table' | 'noHeadings' | 'noContact' | 'tooLong' | 'tooShort';
  severity: 'info' | 'warn';
  /** An i18n key under `documentChecks.`. */
  messageKey: string;
  /** Index of the top-level block the hint is about, when there is one to jump to. */
  nodeIndex?: number;
}

export const ATS_LENGTH_LIMITS = { minWords: 150, maxWords: 1000 } as const;

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/;
// Seven or more digits once spacing and punctuation are ignored, so a year or
// a count does not pass for a phone number.
const PHONE = /(?:\+?\d[\s().-]?){7,}/;

export function parseResumeDoc(contentJson: string): TiptapNode | null {
  try {
    const parsed: unknown = JSON.parse(contentJson);
    if (parsed && typeof parsed === 'object' && (parsed as TiptapNode).type === 'doc') {
      return parsed as TiptapNode;
    }
  } catch {
    // A draft whose JSON is broken has nothing to check.
  }
  return null;
}

function containsType(node: TiptapNode, type: string): boolean {
  return node.type === type || (node.content ?? []).some((child) => containsType(child, type));
}

function textOf(node: TiptapNode): string {
  if (node.text) return node.text;
  return (node.content ?? []).map(textOf).join(node.type === 'doc' ? '\n' : ' ');
}

export function checkResume(doc: TiptapNode): AtsHint[] {
  const blocks = doc.content ?? [];
  const text = textOf(doc);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  // A new, empty draft has nothing to advise on yet.
  if (wordCount === 0) return [];

  const hints: AtsHint[] = [];

  const tableIndex = blocks.findIndex((block) => containsType(block, 'table'));
  if (tableIndex !== -1) {
    hints.push({
      id: 'table',
      severity: 'warn',
      messageKey: 'documentChecks.table',
      nodeIndex: tableIndex,
    });
  }
  if (!blocks.some((block) => block.type === 'heading')) {
    hints.push({ id: 'noHeadings', severity: 'warn', messageKey: 'documentChecks.noHeadings' });
  }
  if (!EMAIL.test(text) && !PHONE.test(text)) {
    hints.push({ id: 'noContact', severity: 'warn', messageKey: 'documentChecks.noContact' });
  }
  if (wordCount > ATS_LENGTH_LIMITS.maxWords) {
    hints.push({ id: 'tooLong', severity: 'info', messageKey: 'documentChecks.tooLong' });
  } else if (wordCount < ATS_LENGTH_LIMITS.minWords) {
    hints.push({ id: 'tooShort', severity: 'info', messageKey: 'documentChecks.tooShort' });
  }
  return hints;
}
