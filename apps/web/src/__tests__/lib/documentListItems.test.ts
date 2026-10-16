import { describe, it, expect } from 'vitest';
import {
  buildListItems,
  countItems,
  effectiveFilter,
  fileExtension,
  filterItems,
} from '#/lib/documentListItems';
import type {
  Document,
  DocumentDraft,
} from '#/routes/_authenticated/applications/$applicationId/-documentQueries';

const doc = (id: string, createdAt: string, over: Partial<Document> = {}): Document => ({
  id,
  applicationId: 'app-1',
  name: `${id}.pdf`,
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  url: `https://example.com/${id}.pdf`,
  documentType: 'resume',
  version: null,
  createdAt,
  ...over,
});

const draft = (id: string, updatedAt: string): DocumentDraft => ({
  id,
  applicationId: 'app-1',
  type: 'resume',
  title: id,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt,
});

describe('buildListItems', () => {
  it('merges drafts and files, newest first', () => {
    const items = buildListItems(
      [draft('d-old', '2024-01-02T00:00:00.000Z'), draft('d-new', '2024-03-01T00:00:00.000Z')],
      [doc('f-mid', '2024-02-01T00:00:00.000Z')],
    );
    expect(items.map((i) => i.id)).toEqual(['d-new', 'f-mid', 'd-old']);
    expect(items.map((i) => i.kind)).toEqual(['draft', 'file', 'draft']);
  });

  it('does not mutate its inputs', () => {
    const drafts = [draft('a', '2024-01-01T00:00:00.000Z'), draft('b', '2024-02-01T00:00:00.000Z')];
    const snapshot = [...drafts];
    buildListItems(drafts, []);
    expect(drafts).toEqual(snapshot);
  });

  it('keeps a draft and a file that share an id apart', () => {
    const items = buildListItems(
      [draft('same', '2024-01-01T00:00:00.000Z')],
      [doc('same', '2024-01-02T00:00:00.000Z')],
    );
    expect(new Set(items.map((i) => i.key)).size).toBe(2);
  });
});

describe('filterItems / countItems / effectiveFilter', () => {
  const items = buildListItems(
    [draft('d1', '2024-01-01T00:00:00.000Z')],
    [doc('f1', '2024-01-02T00:00:00.000Z'), doc('f2', '2024-01-03T00:00:00.000Z')],
  );

  it('counts each kind', () => {
    expect(countItems(items)).toEqual({ all: 3, drafts: 1, files: 2 });
  });

  it('filters by kind', () => {
    expect(filterItems(items, 'all')).toHaveLength(3);
    expect(filterItems(items, 'drafts').map((i) => i.id)).toEqual(['d1']);
    expect(filterItems(items, 'files').map((i) => i.id)).toEqual(['f2', 'f1']);
  });

  it('ignores the chosen filter unless both kinds exist', () => {
    expect(effectiveFilter('drafts', { all: 3, drafts: 1, files: 2 })).toBe('drafts');
    expect(effectiveFilter('drafts', { all: 2, drafts: 0, files: 2 })).toBe('all');
    expect(effectiveFilter('files', { all: 1, drafts: 1, files: 0 })).toBe('all');
  });
});

describe('fileExtension', () => {
  it('uses the file name extension, upper-cased', () => {
    expect(fileExtension('Jordan_Lee_Resume_v3.pdf', 'application/pdf')).toBe('PDF');
    expect(fileExtension('cv.final.docx', 'x')).toBe('DOCX');
  });

  it('falls back to the MIME subtype when the name has no extension', () => {
    expect(fileExtension('resume', 'application/pdf')).toBe('PDF');
  });

  it('returns null when neither says anything useful', () => {
    expect(fileExtension('resume', 'application/octet-stream')).toBeNull();
    expect(fileExtension('resume', '')).toBeNull();
  });
});
