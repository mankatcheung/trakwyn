import { resolve } from 'node:path';
import { extractFromDirectory, extractFromSource } from './support/extractGraphqlDocuments';

const PACKAGE_ROOT = resolve(__dirname, '../..');

describe('extractFromSource', () => {
  it('finds a plain document and reads its operation name', () => {
    const { documents, unresolved } = extractFromSource(
      'operations.ts',
      'export const NOTES_QUERY = `\n  query Notes($id: ID!) {\n    notes(applicationId: $id) { id }\n  }\n`;',
    );

    expect(unresolved).toEqual([]);
    expect(documents).toHaveLength(1);
    expect(documents[0].name).toBe('Notes');
    expect(documents[0].text).toContain('notes(applicationId: $id)');
  });

  it('resolves a document assembled from a shared field list', () => {
    const { documents, unresolved } = extractFromSource(
      'operations.ts',
      [
        'const NOTE_FIELDS = `\n  id\n  content\n`;',
        'export const NOTES_QUERY = `\n  query Notes {\n    notes {\n      ${NOTE_FIELDS}\n    }\n  }\n`;',
      ].join('\n'),
    );

    expect(unresolved).toEqual([]);
    expect(documents).toHaveLength(1);
    // The text that goes over the wire, not the text that appears in the file.
    expect(documents[0].text).toContain('content');
  });

  it('resolves a field list that is itself assembled from another', () => {
    const { documents } = extractFromSource(
      'operations.ts',
      [
        'const BASE = `\n  id\n`;',
        'const FIELDS = `\n  ${BASE}\n  content\n`;',
        'export const Q = `\n  query Notes {\n    notes {\n      ${FIELDS}\n    }\n  }\n`;',
      ].join('\n'),
    );

    expect(documents[0].text).toContain('id');
    expect(documents[0].text).toContain('content');
  });

  it('reports an interpolation it cannot resolve instead of dropping the document', () => {
    const { documents, unresolved } = extractFromSource(
      'operations.ts',
      'export const Q = `\n  query Notes {\n    notes {\n      ${buildFields()}\n    }\n  }\n`;',
    );

    // Silently returning zero documents here is the failure mode this guards:
    // an unvalidated document is exactly what JEF-300's G-3 is about.
    expect(documents).toEqual([]);
    expect(unresolved).toEqual([{ file: 'operations.ts', line: 4, expression: 'buildFields()' }]);
  });

  it('ignores template literals that are not documents', () => {
    const { documents, unresolved } = extractFromSource(
      'ApplicationListItem.tsx',
      'const id = "1";\nexport const testID = `application-item-${id}`;\nexport const url = `${base}/graphql`;',
    );

    expect(documents).toEqual([]);
    // A testID is not a document, so an interpolation inside one is not a
    // failure to resolve — this must not turn every dynamic string in the app
    // into a reported problem.
    expect(unresolved).toEqual([]);
  });
});

describe('extractFromDirectory', () => {
  const { documents, unresolved } = extractFromDirectory(PACKAGE_ROOT, ['src', 'app']);

  it('resolves every document in the app', () => {
    expect(unresolved).toEqual([]);
  });

  it('finds the documents the app actually sends', () => {
    // A guard on the extractor itself: matching nothing would let
    // graphqlDocuments.test.ts validate an empty list and pass.
    expect(documents.length).toBeGreaterThan(50);
    expect(documents.map((d) => d.name)).toContain('LoginMobile');
    expect(documents.map((d) => d.name)).toContain('RefreshTokenMobile');
  });

  it('reads no test or integration sources', () => {
    expect(documents.filter((d) => d.file.includes('__tests__'))).toEqual([]);
    expect(documents.filter((d) => d.file.includes('__integration__'))).toEqual([]);
  });
});
