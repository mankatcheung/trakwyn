import { describe, expect, it } from 'vitest';
import { blobAccessOf } from '../../routes/_authenticated/applications/$applicationId/-components/documentUploadAccess';

describe('blobAccessOf', () => {
  it('uses the private store when the API says private', () => {
    expect(blobAccessOf('private')).toBe('private');
  });

  it('uses the public store when the API says public', () => {
    expect(blobAccessOf('public')).toBe('public');
  });

  // An API that predates the private store sends nothing, and its token is for
  // the one public store; so the web deploy can go out first (JEF-51).
  it.each([[undefined], [null], [''], ['Private'], ['anything else']])(
    'is public for %j, so only an explicit private ever asks for the private store',
    (access) => {
      expect(blobAccessOf(access)).toBe('public');
    },
  );
});
