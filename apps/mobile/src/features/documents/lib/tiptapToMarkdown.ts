/**
 * TipTap JSON to the Markdown the mobile editor shows (JEF-586); the inverse of
 * `markdownToTiptapDoc`. `lossy` is true when the document uses something
 * Markdown cannot say here (alignment, highlight, underline, tables, nested
 * lists, ...). Saving such a draft from the text on screen would drop it, so the
 * screen keeps autosave off until the user chooses to edit anyway.
 */
import type { TiptapMark, TiptapNode } from './tiptapTypes';

export interface MarkdownResult {
  markdown: string;
  lossy: boolean;
}

const SUPPORTED_MARKS = new Set(['bold', 'italic', 'strike', 'link']);
const BLOCKS_IN_QUOTE = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'blockquote',
  'horizontalRule',
]);

interface Ctx {
  lossy: boolean;
}

function isAligned(node: TiptapNode): boolean {
  const align = node.attrs?.textAlign;
  return typeof align === 'string' && align !== '' && align !== 'left';
}

/** Escapes what the parser would otherwise read as formatting. */
function escapeText(text: string): string {
  return text
    .replace(/[\\*~[\]]/g, '\\$&')
    .replace(/_/g, (match, offset: number, whole: string) => {
      const alnum = /[A-Za-z0-9]/;
      const inWord = alnum.test(whole[offset - 1] ?? '') && alnum.test(whole[offset + 1] ?? '');
      return inWord ? match : '\\_';
    });
}

/** Escapes a block marker at the start of a line of text. */
function escapeLineStart(line: string): string {
  return line.replace(/^(\s*)([#>+-])/, '$1\\$2').replace(/^(\s*\d+)([.)])/, '$1\\$2');
}

function wrap(text: string, mark: TiptapMark, hasBold: boolean): string {
  switch (mark.type) {
    case 'bold':
      return `**${text}**`;
    case 'italic':
      return hasBold ? `_${text}_` : `*${text}*`;
    case 'strike':
      return `~~${text}~~`;
    case 'link': {
      const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '';
      return href ? `[${text}](${href})` : text;
    }
    default:
      return text;
  }
}

function textToMarkdown(node: TiptapNode, ctx: Ctx): string {
  const raw = node.text ?? '';
  const marks = node.marks ?? [];
  if (marks.some((m) => !SUPPORTED_MARKS.has(m.type))) ctx.lossy = true;
  // A mark's markers must hug the text, so surrounding spaces move outside them.
  const lead = /^\s*/.exec(raw)![0];
  const trail = raw.length > lead.length ? /\s*$/.exec(raw)![0] : '';
  let text = escapeText(raw.slice(lead.length, raw.length - trail.length));
  if (text === '') return raw;
  const supported = marks.filter((m) => SUPPORTED_MARKS.has(m.type));
  const hasBold = supported.some((m) => m.type === 'bold');
  // Innermost first: italic, strike, bold, then the link around all of them.
  const order = ['italic', 'strike', 'bold', 'link'];
  for (const type of order) {
    const mark = supported.find((m) => m.type === type);
    if (mark) text = wrap(text, mark, hasBold);
  }
  return `${lead}${text}${trail}`;
}

function inlineToMarkdown(nodes: TiptapNode[] | undefined, ctx: Ctx): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === 'text') return textToMarkdown(node, ctx);
      if (node.type === 'hardBreak') return '\n';
      ctx.lossy = true;
      return inlineToMarkdown(node.content, ctx);
    })
    .join('');
}

function paragraphText(node: TiptapNode, ctx: Ctx): string {
  return inlineToMarkdown(node.content, ctx).split('\n').map(escapeLineStart).join('\n');
}

function listToMarkdown(node: TiptapNode, ctx: Ctx): string {
  const ordered = node.type === 'orderedList';
  return (node.content ?? [])
    .map((item, index) => {
      const children = item.content ?? [];
      const first = children[0];
      if (item.type !== 'listItem' || children.length !== 1 || first?.type !== 'paragraph') {
        ctx.lossy = true;
      }
      if (first && isAligned(first)) ctx.lossy = true;
      const text = (children.length > 0 ? children : [])
        .map((child) =>
          child.type === 'paragraph' ? inlineToMarkdown(child.content, ctx) : blockText(child, ctx),
        )
        .join(' ')
        .replace(/\n/g, ' ');
      return `${ordered ? `${index + 1}.` : '-'} ${text}`;
    })
    .join('\n');
}

function quoteToMarkdown(node: TiptapNode, ctx: Ctx): string {
  const children = node.content ?? [];
  if (children.some((child) => !BLOCKS_IN_QUOTE.has(child.type))) ctx.lossy = true;
  return blocksToMarkdown(children, ctx)
    .split('\n')
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');
}

/** What an unsupported block shows as: its text, so the user still sees it. */
function blockText(node: TiptapNode, ctx: Ctx): string {
  ctx.lossy = true;
  return (node.content ?? [])
    .map((child) => (child.type === 'text' ? textToMarkdown(child, ctx) : blockText(child, ctx)))
    .join(' ')
    .trim();
}

function blockToMarkdown(node: TiptapNode, ctx: Ctx): string | null {
  switch (node.type) {
    case 'paragraph': {
      if (isAligned(node)) ctx.lossy = true;
      const text = paragraphText(node, ctx);
      return text === '' ? null : text;
    }
    case 'heading': {
      if (isAligned(node)) ctx.lossy = true;
      const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
      const text = inlineToMarkdown(node.content, ctx).replace(/\n/g, ' ');
      return `${'#'.repeat(level)} ${text}`;
    }
    case 'bulletList':
    case 'orderedList':
      return listToMarkdown(node, ctx);
    case 'blockquote':
      return quoteToMarkdown(node, ctx);
    case 'horizontalRule':
      return '---';
    default: {
      const text = blockText(node, ctx);
      return text === '' ? null : text;
    }
  }
}

function blocksToMarkdown(nodes: TiptapNode[], ctx: Ctx): string {
  return nodes
    .map((node) => blockToMarkdown(node, ctx))
    .filter((block): block is string => block !== null)
    .join('\n\n');
}

/** The Markdown for a TipTap document node (or any array of its blocks). */
export function tiptapToMarkdown(doc: TiptapNode): MarkdownResult {
  const ctx: Ctx = { lossy: false };
  const markdown = blocksToMarkdown(doc.content ?? [], ctx);
  return { markdown, lossy: ctx.lossy };
}

/**
 * The text a draft opens with. A `contentJson` that does not parse falls back to
 * the draft's `plainText`, which is never lossy.
 */
export function draftToMarkdown(draft: { contentJson: string; plainText: string }): MarkdownResult {
  try {
    const doc: unknown = JSON.parse(draft.contentJson);
    if (typeof doc === 'object' && doc !== null && (doc as TiptapNode).type === 'doc') {
      return tiptapToMarkdown(doc as TiptapNode);
    }
  } catch {
    // Fall through to the plain text below.
  }
  return { markdown: draft.plainText, lossy: false };
}
