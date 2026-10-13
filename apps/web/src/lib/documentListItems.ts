import type {
  Document,
  DocumentDraft,
} from '#/routes/_authenticated/applications/$applicationId/-documentQueries';

/**
 * One row of a document tab. Drafts (written in Trakwyn) and files (uploaded
 * as is) share one list, newest first, and stay apart by `kind` (JEF-399).
 */
export type ListItem =
  | { kind: 'draft'; key: string; id: string; sortAt: string; draft: DocumentDraft }
  | { kind: 'file'; key: string; id: string; sortAt: string; document: Document };

export type ListFilter = 'all' | 'drafts' | 'files';

export interface ListCounts {
  all: number;
  drafts: number;
  files: number;
}

export function buildListItems(
  drafts: readonly DocumentDraft[],
  documents: readonly Document[],
): ListItem[] {
  const items: ListItem[] = [
    ...drafts.map((draft): ListItem => ({
      kind: 'draft',
      key: `draft-${draft.id}`,
      id: draft.id,
      sortAt: draft.updatedAt,
      draft,
    })),
    ...documents.map((document): ListItem => ({
      kind: 'file',
      key: `file-${document.id}`,
      id: document.id,
      sortAt: document.createdAt,
      document,
    })),
  ];
  return items.sort((a, b) => Date.parse(b.sortAt) - Date.parse(a.sortAt));
}

export function countItems(items: readonly ListItem[]): ListCounts {
  const drafts = items.filter((i) => i.kind === 'draft').length;
  return { all: items.length, drafts, files: items.length - drafts };
}

export function filterItems(items: readonly ListItem[], filter: ListFilter): ListItem[] {
  if (filter === 'all') return [...items];
  const kind = filter === 'drafts' ? 'draft' : 'file';
  return items.filter((i) => i.kind === kind);
}

/**
 * The filter only means something while both kinds exist. Once one kind is
 * gone the control is hidden, so a stale choice must not leave the list empty.
 */
export function effectiveFilter(filter: ListFilter, counts: ListCounts): ListFilter {
  return counts.drafts > 0 && counts.files > 0 ? filter : 'all';
}

/** "PDF", "DOCX": from the file name, else the MIME subtype, else nothing. */
export function fileExtension(name: string, mimeType: string): string | null {
  const dot = name.lastIndexOf('.');
  if (dot > 0 && dot < name.length - 1) return name.slice(dot + 1).toUpperCase();
  const subtype = mimeType.split('/')[1];
  if (subtype && subtype !== 'octet-stream' && /^[a-z0-9]+$/i.test(subtype)) {
    return subtype.toUpperCase();
  }
  return null;
}
